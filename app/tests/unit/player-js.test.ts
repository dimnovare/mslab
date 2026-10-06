import { expect, test } from "vitest";
import { playerCommand, readPlayerMessage, secondsOf } from "@/components/account/player-js";

test("a Player.js event: a JSON string (or an object) with context player.js; anything else is nothing", () => {
  expect(readPlayerMessage(JSON.stringify({ context: "player.js", version: "0.0.11", event: "timeupdate", value: { seconds: 3.2, duration: 100 } }))).toEqual({ event: "timeupdate", value: { seconds: 3.2, duration: 100 } });
  expect(readPlayerMessage({ context: "player.js", event: "ready" })).toEqual({ event: "ready", value: undefined });
  for (const other of ["{bad json", JSON.stringify({ context: "other", event: "ready" }), JSON.stringify({ context: "player.js" }), null, 42, "ready"]) expect(readPlayerMessage(other)).toBeNull();
});

test("a command for the iframe: a JSON string with context, version, method, value and listener", () => {
  expect(JSON.parse(playerCommand("addEventListener", "timeupdate", "mslab-timeupdate"))).toEqual({ context: "player.js", version: "0.0.11", method: "addEventListener", value: "timeupdate", listener: "mslab-timeupdate" });
  expect(JSON.parse(playerCommand("play"))).toEqual({ context: "player.js", version: "0.0.11", method: "play" });
});

test("the seconds of a timeupdate (a number, or a numeric string some players send), else null", () => {
  expect(secondsOf({ seconds: 12.5, duration: 100 })).toBe(12.5);
  expect(secondsOf({ seconds: "7" })).toBe(7);
  for (const bad of [{ seconds: -1 }, { seconds: "x" }, {}, null, 5]) expect(secondsOf(bad)).toBeNull();
});
