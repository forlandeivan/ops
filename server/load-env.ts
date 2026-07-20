// W2/S3 (docs/w2-workflow-packaging-plan.md): реализация переехала в @unica/runtime-utils.
// Side-effect модуль (dotenv-загрузка) — шим ре-триггерит побочный эффект (не export *).
// ~9 импортёров (entrypoints/скрипты/db) через `import "./load-env"` не трогаются.
import "@unica/runtime-utils/load-env";
