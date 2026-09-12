import { useTheme } from "../../hooks/useTheme";

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <button className="theme-toggle" onClick={toggle} title="Toggle theme">
      {theme === "dark" ? "🌙 Dark" : "☀️ Light"}
    </button>
  );
}
