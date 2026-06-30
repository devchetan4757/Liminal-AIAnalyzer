import { Bot, Trash2 } from "lucide-react";

export default function Header({ onClearChat }) {
  return (
    <header className="app-header">
      <div className="app-header__left">
        <div className="app-header__dot">
          <Bot size={26} strokeWidth={2} />
        </div>

        <div className="app-header__titles">
          <h1 className="app-header__brand">
            Liminal
          </h1>

          <p className="app-header__subtitle">
            Your intelligent AI assistant
          </p>
        </div>
      </div>

      <button
        className="app-header__clear"
        onClick={onClearChat}
        title="Clear conversation"
        aria-label="Clear conversation"
      >
        <Trash2 size={18} />

        <span className="app-header__clear-label">
          Clear Chat
        </span>
      </button>
    </header>
  );
}
