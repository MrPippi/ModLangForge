import { t } from './i18n/zh-TW';

export default function App() {
  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-slate-200 px-4 py-2 dark:border-slate-700">
        <h1 className="text-lg font-bold">{t.app.title}</h1>
        <span className="text-sm text-slate-500">{t.app.subtitle}</span>
      </header>
      <main className="flex flex-1 items-center justify-center">
        <p>{t.dropzone.hint}</p>
      </main>
    </div>
  );
}
