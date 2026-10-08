import { describe, expect, it } from "vitest";
import { signRoomTicket, verifyRoomTicket } from "@/lib/game/ticket";

const SECRET = "test-secret-value";
const now = 1_700_000_000;

describe("room tickets", () => {
  it("round-trips a valid ticket", () => {
    const raw = signRoomTicket({ room: "m1", sub: "user-1", exp: now + 60 }, SECRET);
    expect(verifyRoomTicket(raw, SECRET, now)).toEqual({ room: "m1", sub: "user-1", exp: now + 60 });
  });

  it("rejects a tampered payload", () => {
    const raw = signRoomTicket({ room: "m1", sub: "user-1", exp: now + 60 }, SECRET);
    const [body, mac] = raw.split(".");
    const forged = Buffer.from(JSON.stringify({ room: "m2", sub: "user-9", exp: now + 60 })).toString("base64url");
    expect(verifyRoomTicket(`${forged}.${mac}`, SECRET, now)).toBeNull();
    expect(verifyRoomTicket(`${body}.${mac}x`, SECRET, now)).toBeNull();
  });

  it("rejects a ticket signed with another key", () => {
    const raw = signRoomTicket({ room: "m1", sub: "user-1", exp: now + 60 }, "other-secret");
    expect(verifyRoomTicket(raw, SECRET, now)).toBeNull();
  });

  it("rejects an expired ticket", () => {
    const raw = signRoomTicket({ room: "m1", sub: "user-1", exp: now - 1 }, SECRET);
    expect(verifyRoomTicket(raw, SECRET, now)).toBeNull();
  });

  it("rejects malformed input and an unset secret", () => {
    expect(verifyRoomTicket("", SECRET, now)).toBeNull();
    expect(verifyRoomTicket("nodot", SECRET, now)).toBeNull();
    expect(verifyRoomTicket("a.", SECRET, now)).toBeNull();
    const raw = signRoomTicket({ room: "m1", sub: "user-1", exp: now + 60 }, SECRET);
    expect(verifyRoomTicket(raw, "", now)).toBeNull();
  });
});
