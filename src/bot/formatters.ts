import type { DemoRow } from "../db/demoRepository.js";

export function formatDemoList(demos: DemoRow[]): string {
  if (demos.length === 0) {
    return "📁 В архиве пока нет демок.";
  }

  const items = demos.map((demo) => {
    const source = demo.url
      ? `🔗 ${demo.url}`
      : "🎧 Аудио из Telegram";

    return (
      `🎵 #${demo.id} — ${demo.title}\n` +
      `${source}\n` +
      `▶️ /demo ${demo.id}`
    );
  });

  return `🎧 Последние демки:\n\n${items.join("\n\n")}`;
}
