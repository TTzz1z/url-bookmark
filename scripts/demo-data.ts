import {
  clearDemoData,
  seedDemoData,
  type DemoClearResult,
  type DemoSeedResult,
} from "../src/db/demo-data";

type DemoAction = "seed" | "clear";

function printSeedResult(result: DemoSeedResult): void {
  console.log(`演示数据初始化完成：${result.databasePath}`);
  console.log(`- 书签：${result.bookmarksUpserted} 条`);
  console.log(`- 新建标签：${result.tagsCreated} 个`);
  console.log(`- 复用已有同名标签：${result.existingTagsReused} 个`);
  console.log("可重复执行；再次运行会恢复标准演示内容，不会创建重复记录。");
}

function printClearResult(result: DemoClearResult): void {
  console.log(`演示数据清理完成：${result.databasePath}`);
  console.log(`- 删除演示书签：${result.bookmarksDeleted} 条`);
  console.log(`- 删除未被使用的演示标签：${result.tagsDeleted} 个`);
  console.log(`- 保留仍被普通书签使用的演示标签：${result.tagsRetained} 个`);
  console.log("普通书签、普通标签和数据库迁移记录均未修改。");
}

function main(): void {
  const action = process.argv[2] as DemoAction | undefined;
  if (action === "seed") {
    printSeedResult(seedDemoData());
    return;
  }
  if (action === "clear") {
    printClearResult(clearDemoData());
    return;
  }
  throw new Error(
    "缺少操作参数。请使用 npm run db:seed:demo 或 npm run db:clear:demo。",
  );
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
