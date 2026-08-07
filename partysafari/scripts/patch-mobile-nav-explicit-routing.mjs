import fs from "node:fs";
import path from "node:path";

const filePath = path.resolve("src/components/NavBar.tsx");
let source = fs.readFileSync(filePath, "utf8");

if (source.includes("handleMobileNavClick")) {
  console.log("Mobile nav explicit routing patch already applied.");
  process.exit(0);
}

source = source.replace(
  `  const closeMobileMenu = () => {\n    setMobileMenuOpen(false);\n  };`,
  `  const closeMobileMenu = () => {\n    setMobileMenuOpen(false);\n  };\n\n  const handleMobileNavClick = (event: React.MouseEvent<HTMLDivElement>) => {\n    const target = event.target as HTMLElement;\n    const anchor = target.closest(\"a[href]\") as HTMLAnchorElement | null;\n    if (!anchor) return;\n\n    const href = anchor.getAttribute(\"href\");\n    if (!href || !href.startsWith(\"/\")) return;\n\n    event.preventDefault();\n    event.stopPropagation();\n    setMobileMenuOpen(false);\n    window.location.assign(href);\n  };`
);

source = source.replace(
  `        <div\n          id="mobile-primary-nav"\n          className=`,
  `        <div\n          id="mobile-primary-nav"\n          onClick={handleMobileNavClick}\n          className=`
);

fs.writeFileSync(filePath, source);
console.log("Applied native mobile nav routing fallback.");
