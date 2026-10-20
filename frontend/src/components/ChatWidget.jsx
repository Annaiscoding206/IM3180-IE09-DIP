
import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import "./ChatWidget.css";

const MAX_MESSAGE_LENGTH = 2000;

export default function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState("");

  const bottomRef = useRef(null);
  const messageIdRef = useRef(0);

  // Scroll to the latest message when the panel is open.
  useEffect(() => {
    if (isOpen) {
      bottomRef.current?.scrollIntoView({
        behavior: "smooth",
      });
    }
  }, [messages, isSending, isOpen]);

  // Load shared conversation history whenever Leo opens.
  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;

    const loadHistory = async () => {
      setIsLoadingHistory(true);
      setError("");

      try {
        const result = await api.getActiveChat();

        if (cancelled) return;

        // Convert MySQL messages into ChatWidget format.
        const savedMessages = Array.isArray(result.data)
          ? result.data.map((message, index) => ({
              id: `saved-${message.message_id ?? index}`,
              role: message.role,
              content: message.content,
              source_channel: message.source_channel,
            }))
          : [];

        setMessages(savedMessages);

      } catch (err) {
        if (!cancelled) {
          setError(
            err.message || "Unable to load conversation history."
          );
        }

      } finally {
        if (!cancelled) {
          setIsLoadingHistory(false);
        }
      }
    };

    loadHistory();

    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  const sendMessage = async (event) => {
    event.preventDefault();

    const message = input.trim();

    if (!message || isSending) return;

    if (message.length > MAX_MESSAGE_LENGTH) {
      setError("Your message is too long.");
      return;
    }

    // Add the student's message immediately.
    setMessages((previous) => [
      ...previous,
      {
        id: ++messageIdRef.current,
        role: "user",
        content: message,
      },
    ]);

    setInput("");
    setError("");
    setIsSending(true);

    try {
      // Call the existing Express Chat API.
      const result = await api.askChat(message);

      if (
        !result?.success ||
        typeof result.reply !== "string" ||
        !result.reply.trim()
      ) {
        throw new Error("The assistant returned no response.");
      }

      setMessages((previous) => [
        ...previous,
        {
          id: ++messageIdRef.current,
          role: "assistant",
          content: result.reply,
        },
      ]);
    } catch (err) {
      setError(
        err.message || "Unable to contact Le Assistant."
      );
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="chat-widget">
      {/* Floating chatbot button */}
      {!isOpen && (
        <button
          type="button"
          className="chat-launcher"
          onClick={() => setIsOpen(true)}
          aria-label="Open Leo Assistant"
        >
          <span aria-hidden="true">✦</span>
          <span>Ask Leo</span>
        </button>
      )}

      {/* Chat window */}
      {isOpen && (
        <section
          className="chat-panel"
          aria-label="Leo Assistant"
        >
          <header className="chat-header">
            <div>
              <h2>✦ Leo Assistant</h2>
              <p>Your academic planning companion</p>
            </div>

            <button
              type="button"
              className="chat-close"
              onClick={() => setIsOpen(false)}
              aria-label="Close assistant"
            >
              ×
            </button>
          </header>

          {/* Conversation messages */}
          <div
            className="chat-messages"
            role="log"
            aria-live="polite"
            aria-relevant="additions"
          >
          {/* Show loading state while fetching MySQL history */}
          {isLoadingHistory && (
            <div className="chat-message assistant">
            <div className="chat-bubble chat-typing">
              Loading previous conversations…
            </div>
            </div>
          )}
            {!isLoadingHistory && messages.length === 0 && (
              <div className="chat-welcome">
                <span className="chat-welcome-icon">✦</span>
                <h3>Hi! How can I help?</h3>
                <p>
                  Ask me about courses, academic requirements,
                  or general timetable information.
                </p>
                <small>
                  Leo can continue your demo conversation between
                  the Smart STARS website and Telegram.
                </small>

              </div>
            )}

            {messages.map((message) => (
              <div
                key={message.id}
                className={`chat-message ${message.role}`}
              >
                <div className="chat-bubble">
                  {message.content}
                </div>
              </div>
            ))}

            {isSending && (
              <div className="chat-message assistant">
                <div className="chat-bubble chat-typing">
                  Leo is thinking…
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Error message */}
          {error && (
            <p className="chat-error" role="alert">
              {error}
            </p>
          )}

          {/* Message input */}
          <form
            className="chat-input-area"
            onSubmit={sendMessage}
          >
            <input
              type="text"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Ask about a course..."
              aria-label="Message to Leo Assistant"
              maxLength={MAX_MESSAGE_LENGTH}
              disabled={isSending}
            />

            <button
              type="submit"
              disabled={isSending || !input.trim()}
              aria-label="Send message"
            >
              ➤
            </button>
          </form>
        </section>
      )}
    </div>
  );
}
