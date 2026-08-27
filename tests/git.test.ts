// tests/git.test.ts
// Git 模块基础测试

import { ensureRepo, commitChange, getHistory, getBranches, hasUncommittedChanges } from "../lib/git/git-manager";

describe("Git Manager", () => {
  beforeAll(async () => {
    await ensureRepo();
  });

  it("should initialize git repo", async () => {
    const branches = await getBranches();
    expect(branches.length).toBeGreaterThanOrEqual(1);
  });

  it("should commit changes", async () => {
    const oid = await commitChange("测试提交 - Test commit");
    expect(oid).toBeTruthy();
    expect(typeof oid).toBe("string");
  });

  it("should get commit history", async () => {
    const history = await getHistory({ maxCount: 10 });
    expect(Array.isArray(history)).toBe(true);
    if (history.length > 0) {
      expect(history[0]).toHaveProperty("oid");
      expect(history[0]).toHaveProperty("message");
      expect(history[0]).toHaveProperty("author");
    }
  });

  it("should list branches", async () => {
    const branches = await getBranches();
    expect(Array.isArray(branches)).toBe(true);
    branches.forEach((b) => {
      expect(b).toHaveProperty("name");
      expect(b).toHaveProperty("isCurrent");
      expect(b).toHaveProperty("commitOid");
    });
  });

  it("hasUncommittedChanges should return boolean", async () => {
    const result = await hasUncommittedChanges();
    expect(typeof result).toBe("boolean");
  });
});
