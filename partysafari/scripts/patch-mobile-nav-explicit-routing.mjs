import fs from "node:fs";
import path from "node:path";

const navFilePath = path.resolve("src/components/NavBar.tsx");
let navSource = fs.readFileSync(navFilePath, "utf8");

if (!navSource.includes("handleMobileNavClick")) {
  navSource = navSource.replace(
    `  const closeMobileMenu = () => {\n    setMobileMenuOpen(false);\n  };`,
    `  const closeMobileMenu = () => {\n    setMobileMenuOpen(false);\n  };\n\n  const handleMobileNavClick = (event: React.MouseEvent<HTMLDivElement>) => {\n    const target = event.target as HTMLElement;\n    const anchor = target.closest(\"a[href]\") as HTMLAnchorElement | null;\n    if (!anchor) return;\n\n    const href = anchor.getAttribute(\"href\");\n    if (!href || !href.startsWith(\"/\")) return;\n\n    event.preventDefault();\n    event.stopPropagation();\n    setMobileMenuOpen(false);\n    window.location.assign(href);\n  };`
  );

  navSource = navSource.replace(
    `        <div\n          id="mobile-primary-nav"\n          className=`,
    `        <div\n          id="mobile-primary-nav"\n          onClick={handleMobileNavClick}\n          className=`
  );

  fs.writeFileSync(navFilePath, navSource);
  console.log("Applied native mobile nav routing fallback.");
} else {
  console.log("Mobile nav routing fallback already applied.");
}

const notificationFilePath = path.resolve("src/components/NotificationCenter.tsx");
let notificationSource = fs.readFileSync(notificationFilePath, "utf8");

notificationSource = notificationSource.replace(
  'className="absolute right-0 z-20 mt-3 w-[360px] min-w-[320px] rounded-3xl border border-white/10 bg-[#0c0420] p-4 shadow-[0_20px_70px_rgba(38,12,56,0.45)]"',
  'className="fixed left-3 right-3 top-[calc(env(safe-area-inset-top)+5.75rem)] z-[100] max-h-[calc(100dvh-7rem)] overflow-hidden rounded-3xl border border-white/10 bg-[#0c0420]/98 p-4 shadow-[0_20px_70px_rgba(38,12,56,0.55)] backdrop-blur-xl sm:absolute sm:left-auto sm:right-0 sm:top-auto sm:mt-3 sm:w-[min(360px,calc(100vw-1.5rem))] sm:max-h-[70vh]"'
);

notificationSource = notificationSource.replace(
  'className="mb-4 flex items-center justify-between gap-4"',
  'className="mb-4 flex flex-wrap items-start justify-between gap-3"'
);

notificationSource = notificationSource.replace(
  'className="rounded-2xl bg-white/5 px-3 py-2 text-sm text-violet-300 transition hover:bg-white/10"',
  'className="shrink-0 rounded-2xl bg-white/5 px-3 py-2 text-sm text-violet-300 transition hover:bg-white/10"'
);

notificationSource = notificationSource.replace(
  'className="space-y-3">\n              {notifications.map((notification) => (',
  'className="max-h-[calc(100dvh-14rem)] space-y-3 overflow-y-auto overscroll-contain pr-1 sm:max-h-[55vh]">\n              {notifications.map((notification) => ('
);

fs.writeFileSync(notificationFilePath, notificationSource);
console.log("Applied viewport-safe mobile notification panel.");
