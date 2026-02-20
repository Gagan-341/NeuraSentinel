let lastMessage = '';
let speaking = false;
let cooldown = false;

export function speak(text: string) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

  const trimmed = (text || '').trim();
  if (!trimmed) return;

  if (trimmed === lastMessage) return;

  if (cooldown) return;
  cooldown = true;
  setTimeout(() => {
    cooldown = false;
  }, 1800);

  if (speaking) return;

  const utter = new SpeechSynthesisUtterance(trimmed);
  utter.rate = 1;
  utter.pitch = 1;
  utter.volume = 1;
  utter.lang = 'en-US';

  speaking = true;
  lastMessage = trimmed;

  utter.onend = () => {
    speaking = false;
  };

  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utter);
}

// Optional: basic voice command listener. Not wired into UI yet, but available
// if you want to experiment with voice-triggered actions.
export function startListening(callback: (text: string) => void) {
  if (typeof window === 'undefined') return;

  const AnyWindow = window as any;
  const SpeechRecognition = AnyWindow.SpeechRecognition || AnyWindow.webkitSpeechRecognition;
  if (!SpeechRecognition) return;

  const recognition = new SpeechRecognition();
  recognition.lang = 'en-US';
  recognition.continuous = false;

  recognition.onresult = (event: any) => {
    try {
      const text: string = event.results[0][0].transcript.toLowerCase();
      callback(text);
    } catch {
      // ignore parsing errors
    }
  };

  recognition.start();
}
