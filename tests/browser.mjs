import assert from "node:assert/strict";
import { createServer } from "vite";
import { chromium } from "playwright";
import React from "react";
import { renderToString } from "react-dom/server";
import { CursorSwarm } from "../dist/react.js";
import { createCursorSwarm } from "../dist/index.js";

// Importing both entries without window/document must work for SSR.
assert.match(
  renderToString(
    React.createElement(
      CursorSwarm,
      null,
      React.createElement("p", null, "SSR content"),
    ),
  ),
  /SSR content/,
);
assert.throws(() => createCursorSwarm(null), /browser|HTMLElement/i);
const server = await createServer({ server: { host: "127.0.0.1", port: 0 } });
await server.listen();
const base = server.resolvedUrls.local[0];
const executablePath = process.env.CHROMIUM_PATH;
const browser = await chromium.launch({
  ...(executablePath ? { executablePath } : {}),
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
let checks = 0;
async function scenario(name, run, options = {}) {
  const page = await browser.newPage(options),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    await page.goto(base + "tests/fixtures/core.html");
    await page.waitForFunction(() => window.ready);
    await run(page);
    assert.deepEqual(errors, []);
    console.log("PASS " + name);
    checks++;
  } finally {
    await page.close();
  }
}
try {
  await scenario(
    "custom selectors/configuration; form exclusion; property cleanup",
    async (page) => {
      await page.evaluate(() => {
        window.engine = window.createCursorSwarm(
          document.querySelector("#root"),
          {
            selector: "h1,.tile,p",
            speed: 1.5,
            desktopWorkers: 2,
            mobileWorkers: 1,
            labels: ["One", "Two"],
            colors: ["#abcdef"],
          },
        );
        window.engine.start();
      });
      assert.equal(await page.locator(".cursor-swarm-worker").count(), 2);
      assert.equal(await page.locator("form [inert]").count(), 0);
      assert.equal(
        await page.locator(".tile").evaluate((el) => el.inert),
        true,
      );
      await page.evaluate(() => {
        document.querySelector(".tile").style.backgroundColor = "blue";
        window.engine.dispose();
        window.engine.dispose();
      });
      assert.equal(
        await page
          .locator(".cursor-swarm-worker,.cursor-swarm-outline,[inert]")
          .count(),
        0,
      );
      const restored = await page.locator(".tile").evaluate((el) => ({
        opacity: el.style.opacity,
        clip: el.style.clipPath,
        color: el.style.color,
        background: el.style.backgroundColor,
      }));
      assert.deepEqual(restored, {
        opacity: "0.8",
        clip: "inset(0px)",
        color: "red",
        background: "blue",
      });
    },
  );
  await scenario("natural completion restores real content", async (page) => {
    await page.evaluate(() => {
      window.engine = window.createCursorSwarm(
        document.querySelector("#root"),
        { selector: "h1,.tile,p", speed: 20 },
      );
      window.engine.start();
    });
    await page.waitForFunction(
      () => !document.querySelector(".cursor-swarm-worker"),
    );
    assert.equal(await page.locator("[inert]").count(), 0);
    await page.evaluate(() => window.engine.dispose());
  });
  await scenario(
    "async content refresh, Escape latches until explicit restart",
    async (page) => {
      await page.evaluate(() => {
        window.engine = window.createCursorSwarm(
          document.querySelector("#root"),
        );
        window.engine.start();
        document
          .querySelector("#root")
          .insertAdjacentHTML("beforeend", '<p id="late">Late text</p>');
      });
      await page.waitForFunction(() => document.querySelector("#late").inert);
      await page.keyboard.press("Escape");
      await page.evaluate(() =>
        document
          .querySelector("#root")
          .insertAdjacentHTML("beforeend", '<p id="after">After skip</p>'),
      );
      await page.waitForTimeout(80);
      assert.equal(
        await page.locator(".cursor-swarm-worker,[inert]").count(),
        0,
      );
      await page.evaluate(() => window.engine.start());
      assert.equal(
        await page.locator("#after").evaluate((el) => el.inert),
        true,
      );
      await page.evaluate(() => window.engine.dispose());
    },
  );
  await scenario("dispose cancels pending mutation restart", async (page) => {
    await page.evaluate(() => {
      window.engine = window.createCursorSwarm(document.querySelector("#root"));
      window.engine.start();
      document.querySelector("#root").append(document.createElement("p"));
      queueMicrotask(() => window.engine.dispose());
    });
    await page.waitForTimeout(80);
    assert.equal(await page.locator(".cursor-swarm-worker,[inert]").count(), 0);
  });
  await scenario(
    "mobile worker count",
    async (page) => {
      await page.evaluate(() => {
        window.engine = window.createCursorSwarm(
          document.querySelector("#root"),
        );
        window.engine.start();
      });
      assert.equal(await page.locator(".cursor-swarm-worker").count(), 4);
    },
    { viewport: { width: 390, height: 844 } },
  );
  await scenario(
    "reduced motion leaves content visible including late nodes",
    async (page) => {
      await page.evaluate(() => {
        window.engine = window.createCursorSwarm(
          document.querySelector("#root"),
        );
        window.engine.start();
        document
          .querySelector("#root")
          .insertAdjacentHTML("beforeend", "<p>Late</p>");
      });
      await page.waitForTimeout(80);
      assert.equal(
        await page.locator(".cursor-swarm-worker,[inert]").count(),
        0,
      );
    },
    { reducedMotion: "reduce" },
  );
  await scenario(
    "independent instances; reject overlapping roots",
    async (page) => {
      assert.equal(
        await page.evaluate(() => {
          const a = window.createCursorSwarm(document.querySelector("#root")),
            b = window.createCursorSwarm(document.querySelector("#other"));
          a.start();
          b.start();
          let rejected = false;
          try {
            window
              .createCursorSwarm(document.querySelector("#root h1"))
              .start();
          } catch {
            rejected = true;
          }
          a.dispose();
          b.dispose();
          return rejected;
        }),
        true,
      );
      assert.equal(
        await page.locator(".cursor-swarm-worker,[inert]").count(),
        0,
      );
    },
  );
  await scenario("invalid options fail before hiding content", async (page) => {
    for (const options of [
      { speed: 0 },
      { desktopWorkers: 0 },
      { selector: "[" },
      { colors: [] },
      { mobileBreakpoint: -1 },
    ]) {
      assert.equal(
        await page.evaluate((options) => {
          try {
            window
              .createCursorSwarm(document.querySelector("#root"), options)
              .start();
            return false;
          } catch {
            return true;
          }
        }, options),
        true,
      );
      assert.equal(await page.locator("[inert]").count(), 0);
    }
  });
  await scenario(
    "second controller cannot steal the same root",
    async (page) => {
      assert.equal(
        await page.evaluate(() => {
          const root = document.querySelector("#root");
          const a = window.createCursorSwarm(root),
            b = window.createCursorSwarm(root);
          a.start();
          let rejected = false;
          try {
            b.start();
          } catch {
            rejected = true;
          }
          b.dispose();
          a.dispose();
          return rejected;
        }),
        true,
      );
      assert.equal(
        await page.locator(".cursor-swarm-worker,[inert]").count(),
        0,
      );
    },
  );
  await scenario(
    "runtime reduced-motion toggle cleans animation",
    async (page) => {
      await page.evaluate(() => {
        window.engine = window.createCursorSwarm(
          document.querySelector("#root"),
        );
        window.engine.start();
      });
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.waitForFunction(
        () => !document.querySelector(".cursor-swarm-worker"),
      );
      assert.equal(await page.locator("[inert]").count(), 0);
    },
  );
  await scenario(
    "React StrictMode, async skip, resetKey, disable and unmount",
    async (page) => {
      await page.goto(base + "tests/fixtures/react.html");
      await page.waitForFunction(
        () => document.querySelectorAll(".cursor-swarm-worker").length === 7,
      );
      await page.evaluate(
        () =>
          (document.querySelector("#async").innerHTML =
            '<p id="react-late">Async React content</p>'),
      );
      await page.waitForFunction(
        () => document.querySelector("#react-late").inert,
      );
      await page.keyboard.press("Escape");
      await page.evaluate(() =>
        document
          .querySelector("#async")
          .insertAdjacentHTML("beforeend", "<p>Later after skip</p>"),
      );
      await page.waitForTimeout(80);
      assert.equal(
        await page.locator(".cursor-swarm-worker,[inert]").count(),
        0,
      );
      await page.evaluate(() => window.render(1));
      await page.waitForFunction(
        () => document.querySelectorAll(".cursor-swarm-worker").length === 7,
      );
      await page.evaluate(() => window.render(2, false));
      await page.waitForFunction(
        () => !document.querySelector(".cursor-swarm-worker"),
      );
      assert.equal(await page.locator(".cursor-swarm,[inert]").count(), 0);
      await page.evaluate(() => window.unmount());
      assert.equal(
        await page.locator(".cursor-swarm-worker,[inert]").count(),
        0,
      );
    },
  );
  await scenario(
    "body root ignores its own overlay mutations",
    async (page) => {
      await page.evaluate(() => {
        window.overlayStarts = 0;
        new MutationObserver((records) => {
          for (const record of records)
            for (const node of record.addedNodes)
              if (
                node.nodeType === 1 &&
                node.classList.contains("cursor-swarm-worker")
              )
                window.overlayStarts++;
        }).observe(document.body, { childList: true });
        window.engine = window.createCursorSwarm(document.body, { speed: 30 });
        window.engine.start();
      });
      await page.waitForTimeout(600);
      assert.equal(await page.evaluate(() => window.overlayStarts), 7);
      assert.equal(await page.locator(".cursor-swarm-worker").count(), 0);
      assert.equal(await page.locator("[inert]").count(), 0);
      await page.evaluate(() => window.engine.dispose());
    },
  );
  await scenario(
    "observing controller keeps ownership after natural completion",
    async (page) => {
      await page.evaluate(() => {
        window.engine = window.createCursorSwarm(
          document.querySelector("#root"),
          { speed: 30 },
        );
        window.engine.start();
      });
      await page.waitForFunction(
        () => !document.querySelector(".cursor-swarm-worker"),
      );
      assert.equal(
        await page.evaluate(() => {
          const second = window.createCursorSwarm(
            document.querySelector("#root"),
          );
          try {
            second.start();
            return false;
          } catch {
            return true;
          } finally {
            second.dispose();
          }
        }),
        true,
      );
      await page.evaluate(() => {
        document
          .querySelector("#root")
          .insertAdjacentHTML("beforeend", "<p id='owned-late'>Late</p>");
      });
      await page.waitForFunction(
        () => document.querySelector("#owned-late").inert,
      );
      await page.evaluate(() => window.engine.dispose());
    },
  );
  await scenario("native dialog is never animated", async (page) => {
    await page.evaluate(() => {
      document
        .querySelector("#root")
        .insertAdjacentHTML(
          "beforeend",
          "<dialog open><p>Native dialog</p></dialog>",
        );
      window.engine = window.createCursorSwarm(document.querySelector("#root"));
      window.engine.start();
    });
    assert.equal(await page.locator("dialog [inert]").count(), 0);
    await page.evaluate(() => window.engine.dispose());
  });
  console.log(JSON.stringify({ scenarios: checks, ssr: true }));
} finally {
  await browser.close();
  await server.close();
}
