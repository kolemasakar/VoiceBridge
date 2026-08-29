const transcript = document.querySelector("#transcript-final");
const copyButton = document.querySelector("#copy-transcript");

function transcriptText() {
  return String(transcript?.textContent || "").trim();
}

function syncCopyState() {
  if (!copyButton) return;
  copyButton.disabled = transcriptText().length === 0;
}

function fallbackCopy(text) {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) {
    throw new Error("Unable to copy transcript.");
  }
}

async function copyTranscript() {
  const text = transcriptText();
  if (!text || !copyButton) return;

  const originalLabel = copyButton.textContent;
  try {
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        fallbackCopy(text);
      }
    } else {
      fallbackCopy(text);
    }
    copyButton.textContent = "Copied";
  } catch {
    copyButton.textContent = "Copy failed";
  } finally {
    setTimeout(() => {
      copyButton.textContent = originalLabel;
      syncCopyState();
    }, 1200);
  }
}

copyButton?.addEventListener("click", copyTranscript);

if (transcript) {
  new MutationObserver(syncCopyState).observe(transcript, {
    childList: true,
    characterData: true,
    subtree: true
  });
}

syncCopyState();
