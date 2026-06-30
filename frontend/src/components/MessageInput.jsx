import { useRef, useState } from "react";
import { SendHorizontal } from "lucide-react";
import FileUpload from "./FileUpload";

export default function MessageInput({
  onSendText,
  onSendFile,
  disabled,
}) {
  const [text, setText] = useState("");
  const inputRef = useRef(null);

  const submit = () => {
    const value = text.trim();

    if (!value || disabled) return;

    onSendText(value);

    setText("");

    inputRef.current?.focus();
  };

  const handleKeyDown = (e) => {
    if (
      e.key === "Enter" &&
      !e.shiftKey
    ) {
      e.preventDefault();

      submit();
    }
  };

  return (
    <footer className="message-input">
      <div className="message-composer">

        <FileUpload onSelect={onSendFile} />

        <input
          ref={inputRef}
          type="text"
          value={text}
          disabled={disabled}
          placeholder="Message AI Assistant..."
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
        />

        <button
          type="button"
          className="send-button"
          onClick={submit}
          disabled={disabled || !text.trim()}
          title="Send message"
          aria-label="Send message"
        >
          <SendHorizontal
            size={18}
            strokeWidth={2.2}
          />
        </button>

      </div>
    </footer>
  );
}
