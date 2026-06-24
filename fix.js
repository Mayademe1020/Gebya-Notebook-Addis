const fs = require('fs');
let content = fs.readFileSync('d:/Gebya-Notebook-Addis/artifacts/gebya/src/App.jsx', 'utf8');

const replacement = `  const editTarget = useAppStore(s => s.editTarget);
  const setEditTarget = useAppStore(s => s.setEditTarget);
  const deleteTarget = useAppStore(s => s.deleteTarget);
  const setDeleteTarget = useAppStore(s => s.setDeleteTarget);
  const showShareModal = useAppStore(s => s.showShareModal);
  const setShowShareModal = useAppStore(s => s.setShowShareModal);
  const shareText = useAppStore(s => s.shareText);
  const setShareText = useAppStore(s => s.setShareText);
  const pressedBtn = useAppStore(s => s.pressedBtn);
  const setPressedBtn = useAppStore(s => s.setPressedBtn);
  const voiceStep = useAppStore(s => s.voiceStep);
  const setVoiceStep = useAppStore(s => s.setVoiceStep);
  const voiceTranscript = useAppStore(s => s.voiceTranscript);
  const setVoiceTranscript = useAppStore(s => s.setVoiceTranscript);
  const voiceDetectedTotal = useAppStore(s => s.voiceDetectedTotal);
  const setVoiceDetectedTotal = useAppStore(s => s.setVoiceDetectedTotal);
  const voiceItems = useAppStore(s => s.voiceItems);
  const setVoiceItems = useAppStore(s => s.setVoiceItems);
  const voiceConfidence = useAppStore(s => s.voiceConfidence);
  const setVoiceConfidence = useAppStore(s => s.setVoiceConfidence);
  const voiceProvider = useAppStore(s => s.voiceProvider);
  const setVoiceProvider = useAppStore(s => s.setVoiceProvider);
  const voiceDraft = useAppStore(s => s.voiceDraft);
  const setVoiceDraft = useAppStore(s => s.setVoiceDraft);
  const pendingTelegramCount = useAppStore(s => s.pendingTelegramCount);
  const setPendingTelegramCount = useAppStore(s => s.setPendingTelegramCount);
  const retryingTelegram = useAppStore(s => s.retryingTelegram);`;

content = content.replace(/  const editTarget = useAppStore\(s => s\.editTarget\);\r?\n  const retryingTelegram = useAppStore\(s => s\.retryingTelegram\);/, replacement);

fs.writeFileSync('d:/Gebya-Notebook-Addis/artifacts/gebya/src/App.jsx', content);
