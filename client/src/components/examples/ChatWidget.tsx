import ChatWidget from '../ChatWidget';

export default function ChatWidgetExample() {
  return (
    <div className="relative h-screen">
      <div className="p-8">
        <h2 className="text-xl font-semibold mb-4">Chat Widget (opens in bottom-right corner)</h2>
        <p className="text-muted-foreground">Click the chat button in the bottom-right corner to open the chat.</p>
      </div>
      <ChatWidget />
    </div>
  );
}
