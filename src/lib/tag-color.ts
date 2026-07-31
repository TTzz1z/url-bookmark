/** 与侧栏 `.tag-dot-1..6` 使用同一哈希，保证卡片与筛选色点一致。 */
export function tagDotIndex(name: string): number {
  let hash = 0;
  for (let index = 0; index < name.length; index += 1) {
    hash = (hash * 31 + name.charCodeAt(index)) >>> 0;
  }
  return (hash % 6) + 1;
}
