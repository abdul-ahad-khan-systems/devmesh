import { strict as assert } from "node:assert";
import { MissionLock } from "../src/mission-lock.js";

const lock = new MissionLock();

assert.equal(
  lock.isRunning,
  false,
  "Mission lock must start unlocked."
);

assert.equal(
  lock.tryAcquire(),
  true,
  "First mission acquisition must succeed."
);

assert.equal(
  lock.isRunning,
  true,
  "Mission lock must report running after acquisition."
);

assert.equal(
  lock.tryAcquire(),
  false,
  "A second mission must be rejected while one is running."
);

assert.equal(
  lock.isRunning,
  true,
  "Rejected acquisition must not release the active mission."
);

lock.release();

assert.equal(
  lock.isRunning,
  false,
  "Mission lock must be released after mission completion."
);

assert.equal(
  lock.tryAcquire(),
  true,
  "A new mission may start after the previous mission releases the lock."
);

lock.release();

console.log(
  "PASS: DevMesh mission concurrency integrity gate"
);
