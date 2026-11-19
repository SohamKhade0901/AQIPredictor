import React, { useState, useRef, useEffect } from 'react';
import {
  Mic,
  MicOff,
  Send,
  Volume2,
  VolumeX,
  Square,
  Bot,
  User,
  X,
  Sparkles,
  RefreshCw,
  Copy,
  Check,
  AlertCircle,
} from 'lucide-react';
import { useSpeechRecognition } from './useSpeechRecognition';
import { useSpeechSynthesis } from './useSpeechSynthesis';
import { useStation } from '../../context/StationContext';
import { api } from '../../services/api';
import type { ChatMessage } from '../../types';

export const VoiceChatbot: React.FC = () => {
  const { selectedStation, analysis } = useStation();

  // State
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [inputMessage, setInputMessage] = useState<string>('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [providerInfo, setProviderInfo] = useState<string>('AeroCast AI');
  const [dismissPermissionAlert, setDismissPermissionAlert] = useState<boolean>(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Speech hooks
  const {
    isSupported: isSttSupported,
    isListening,
    transcript,
    interimTranscript,
    errorMessage: sttError,
    permissionState,
    startListening,
    stopListening,
    resetTranscript,
    clearError: clearSttError,
  } = useSpeechRecognition((finalTranscript) => {
    // When final speech is recognized, append to input
    if (finalTranscript) {
      setInputMessage((prev) => {
        const spacer = prev && !prev.endsWith(' ') ? ' ' : '';
        return prev + spacer + finalTranscript;
      });
      resetTranscript();
    }
  });

  const {
    isSupported: isTtsSupported,
    isSpeaking,
    autoRead,
    speak,
    stopSpeaking,
    toggleAutoRead,
  } = useSpeechSynthesis();

  // Auto-scroll to bottom of messages
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen, isListening]);

  // Fetch AI Chat status once on mount
  useEffect(() => {
    api.chatStatus()
      .then((res) => {
        if (res.data) {
          if (res.data.activeProvider === 'gemini') {
            setProviderInfo('Gemini 2.5 Flash');
          } else if (res.data.activeProvider === 'openai') {
            setProviderInfo('OpenAI GPT-4o-mini');
          } else {
            setProviderInfo('AeroCast Engine');
          }
        }
      })
      .catch(() => {
        setProviderInfo('AeroCast AI');
      });
  }, []);

  // Update input text while user speaks
  useEffect(() => {
    if (transcript) {
      setInputMessage((prev) => {
        const spacer = prev && !prev.endsWith(' ') ? ' ' : '';
        return prev + spacer + transcript;
      });
      resetTranscript();
    }
  }, [transcript, resetTranscript]);

  // Send message to backend
  const handleSendMessage = async (textToSend?: string, isVoice = false) => {
    const text = (textToSend || inputMessage).trim();
    if (!text || isLoading) return;

    // Stop speaking if assistant is currently talking
    if (isSpeaking) {
      stopSpeaking();
    }

    // Stop mic if listening
    if (isListening) {
      stopListening();
    }

    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      role: 'user',
      content: text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isVoiceInput: isVoice,
    };

    const newHistory = [...messages, userMessage];
    setMessages(newHistory);
    setInputMessage('');
    setIsLoading(true);

    // Build context with current active station data
    const stationContext = {
      stationId: selectedStation?.id,
      stationName: selectedStation?.name,
      currentAQI: analysis?.currentAqi?.aqi ?? null,
      currentPM25: analysis?.latestPm25?.value ?? null,
      category: analysis?.currentAqi?.category ?? 'Monitoring',
      weather: analysis?.weather
        ? {
            temperature: analysis.weather.temperature,
            humidity: analysis.weather.humidity,
            windSpeed: analysis.weather.windSpeed,
            blh: analysis.weather.boundaryLayerHeight,
          }
        : null,
    };

    try {
      const response = await api.chat({
        message: text,
        history: newHistory.map((m) => ({
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content: m.content,
        })),
        context: stationContext,
      });

      if (response.data?.reply) {
        const assistantMessage: ChatMessage = {
          id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          role: 'assistant',
          content: response.data.reply,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          provider: response.data.provider,
          model: response.data.model,
        };

        setMessages((prev) => [...prev, assistantMessage]);

        // Speak aloud if autoRead is enabled
        if (autoRead && isTtsSupported) {
          speak(response.data.reply);
        }
      } else {
        const errorMsg: ChatMessage = {
          id: `msg-${Date.now()}`,
          role: 'assistant',
          content: response.error || 'I encountered an issue retrieving the answer. Please try again.',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };
        setMessages((prev) => [...prev, errorMsg]);
      }
    } catch (err: any) {
      const errorMsg: ChatMessage = {
        id: `msg-${Date.now()}`,
        role: 'assistant',
        content: `Network error: ${err.message || 'Unable to connect to backend'}. Please ensure Express server is running.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleMicClick = () => {
    if (isListening) {
      stopListening();
    } else {
      if (isSpeaking) {
        stopSpeaking();
      }
      clearSttError();
      setDismissPermissionAlert(false);
      startListening();
    }
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleClearHistory = () => {
    stopSpeaking();
    stopListening();
    setMessages([]);
  };

  const promptSuggestions = [
    { title: '24h Forecast', prompt: `What is the predicted AQI in ${selectedStation?.name || 'Anand Vihar'} after 24 hours?` },
    { title: 'Worst Tomorrow', prompt: 'Which Delhi NCR area will have the worst AQI tomorrow?' },
    { title: 'Compare Areas', prompt: 'Compare AQI in Anand Vihar and Punjabi Bagh.' },
    { title: 'All Stations', prompt: 'Show me the 24-hour AQI forecast for all stations.' },
    { title: 'Night Inversion', prompt: 'Why is air pollution in Delhi so much worse at night compared to daytime?' },
  ];

  return (
    <>
      {/* Floating Action Button (Launcher) */}
      {!isOpen && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3">
          {/* Subtle pulse hint when idle */}
          <div className="hidden sm:flex items-center gap-2 bg-white/95 backdrop-blur-md px-3.5 py-1.5 rounded-full shadow-lg border border-slate-200/90 text-xs font-semibold text-slate-700 animate-fade-in">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Voice AI Assistant</span>
          </div>

          <button
            onClick={() => setIsOpen(true)}
            aria-label="Open AI Voice Chatbot"
            className={`group relative flex items-center justify-center h-14 w-14 rounded-full shadow-2xl transition-all duration-300 cursor-pointer ${
              isSpeaking
                ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white scale-105 shadow-purple-500/40 ring-4 ring-purple-300/50'
                : 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:scale-110 shadow-blue-500/40'
            }`}
          >
            {isSpeaking ? (
              <div className="flex items-center gap-0.5">
                <span className="w-1 h-3 bg-white rounded-full animate-bounce [animation-delay:0ms]" />
                <span className="w-1 h-5 bg-white rounded-full animate-bounce [animation-delay:150ms]" />
                <span className="w-1 h-3 bg-white rounded-full animate-bounce [animation-delay:300ms]" />
              </div>
            ) : (
              <>
                <Bot className="h-6 w-6 transition-transform group-hover:rotate-12" />
                <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-emerald-500 border-2 border-white flex items-center justify-center">
                  <Mic className="h-2 w-2 text-white" />
                </span>
              </>
            )}
          </button>
        </div>
      )}

      {/* Main Chatbot Window */}
      {isOpen && (
        <div className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-50 w-[calc(100vw-32px)] sm:w-[420px] h-[600px] max-h-[88vh] bg-white rounded-3xl shadow-2xl border border-slate-200/90 flex flex-col overflow-hidden animate-scale-in font-sans">
          {/* Header */}
          <div className="px-5 py-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between shadow-md shrink-0">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="h-10 w-10 rounded-2xl bg-gradient-to-tr from-blue-500 to-indigo-500 flex items-center justify-center text-white shadow-md shadow-blue-500/30">
                  <Bot className="h-5 w-5" />
                </div>
                {isSpeaking && (
                  <span className="absolute -bottom-1 -right-1 h-3.5 w-3.5 rounded-full bg-purple-400 border-2 border-slate-900 animate-ping" />
                )}
                {isListening && (
                  <span className="absolute -bottom-1 -right-1 h-3.5 w-3.5 rounded-full bg-rose-500 border-2 border-slate-900 animate-pulse" />
                )}
              </div>

              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-sm tracking-tight leading-none text-white">
                    AeroCast Voice AI
                  </h3>
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-blue-500/20 text-blue-300 border border-blue-400/30">
                    {providerInfo}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-slate-300 mt-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shrink-0" />
                  <span className="truncate max-w-[190px]">
                    {selectedStation?.name || 'Delhi NCR'}
                    {analysis?.currentAqi?.aqi ? ` • AQI ${analysis.currentAqi.aqi}` : ''}
                  </span>
                </div>
              </div>
            </div>

            {/* Header Action Controls */}
            <div className="flex items-center gap-1">
              {/* Stop Speech Button (Prominent when speaking) */}
              {isSpeaking && (
                <button
                  onClick={stopSpeaking}
                  title="Stop speech playback"
                  className="p-1.5 rounded-xl bg-rose-500/20 text-rose-300 hover:bg-rose-500/40 transition-colors flex items-center gap-1 text-xs px-2.5 font-medium border border-rose-500/40 cursor-pointer animate-pulse"
                >
                  <Square className="h-3 w-3 fill-rose-300" />
                  <span>Stop</span>
                </button>
              )}

              {/* Auto-read speech toggle */}
              <button
                onClick={toggleAutoRead}
                title={autoRead ? 'Voice output: ON (Click to mute)' : 'Voice output: MUTED (Click to unmute)'}
                className={`p-2 rounded-xl transition-colors cursor-pointer ${
                  autoRead ? 'text-blue-300 hover:bg-white/10' : 'text-slate-400 hover:bg-white/10'
                }`}
              >
                {autoRead ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
              </button>

              {/* Close Button */}
              <button
                onClick={() => {
                  stopSpeaking();
                  stopListening();
                  setIsOpen(false);
                }}
                title="Close chat"
                className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Assistant Speaking Pill Bar */}
          {isSpeaking && (
            <div className="bg-purple-50 border-b border-purple-200/80 px-4 py-2 flex items-center justify-between text-xs text-purple-800 shrink-0 animate-fade-in">
              <div className="flex items-center gap-2">
                <Volume2 className="h-3.5 w-3.5 text-purple-600 animate-bounce" />
                <span className="font-semibold">Assistant is speaking...</span>
              </div>
              <button
                onClick={stopSpeaking}
                className="text-[11px] font-bold text-purple-700 bg-purple-200/70 hover:bg-purple-300/80 px-2 py-0.5 rounded-lg flex items-center gap-1 cursor-pointer transition-colors"
              >
                <Square className="h-2.5 w-2.5 fill-purple-700" />
                Stop Voice
              </button>
            </div>
          )}

          {/* Active Listening Indicator Banner */}
          {isListening && (
            <div className="bg-rose-50 border-b border-rose-200/80 px-4 py-2.5 flex items-center justify-between text-xs text-rose-800 shrink-0 animate-pulse">
              <div className="flex items-center gap-2.5 min-w-0 pr-2">
                <div className="h-6 w-6 rounded-full bg-rose-500 text-white flex items-center justify-center shrink-0">
                  <Mic className="h-3.5 w-3.5 animate-ping" />
                </div>
                <div className="min-w-0">
                  <div className="font-bold flex items-center gap-1.5 text-rose-900">
                    <span>Listening... Speak now</span>
                    <span className="inline-flex gap-0.5 items-center">
                      <span className="h-2 w-0.5 bg-rose-600 rounded-full animate-bounce [animation-delay:0ms]" />
                      <span className="h-3.5 w-0.5 bg-rose-600 rounded-full animate-bounce [animation-delay:150ms]" />
                      <span className="h-2 w-0.5 bg-rose-600 rounded-full animate-bounce [animation-delay:300ms]" />
                    </span>
                  </div>
                  {interimTranscript && (
                    <p className="text-[11px] text-rose-700 italic truncate mt-0.5">
                      "{interimTranscript}"
                    </p>
                  )}
                </div>
              </div>
              <button
                onClick={stopListening}
                className="text-[11px] font-bold text-white bg-rose-600 hover:bg-rose-700 px-2.5 py-1 rounded-xl shrink-0 cursor-pointer transition-colors shadow-xs"
              >
                Done
              </button>
            </div>
          )}

          {/* Permission / Error Notice */}
          {sttError && !dismissPermissionAlert && (
            <div className="bg-amber-50 border-b border-amber-200 p-3 text-xs text-amber-800 flex items-start justify-between gap-2 shrink-0">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold">{sttError}</span>
                  {permissionState === 'denied' && (
                    <p className="text-[11px] text-amber-700 mt-0.5">
                      You can continue chatting normally using text below.
                    </p>
                  )}
                </div>
              </div>
              <button
                onClick={() => setDismissPermissionAlert(true)}
                className="text-amber-600 hover:text-amber-900 p-0.5"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* Voice recognition unsupported fallback banner */}
          {!isSttSupported && (
            <div className="bg-slate-100 border-b border-slate-200 px-4 py-2 text-[11px] text-slate-600 flex items-center justify-between shrink-0">
              <span className="flex items-center gap-1.5">
                <MicOff className="h-3.5 w-3.5 text-slate-400" />
                Browser Speech-to-Text unavailable. Text chat is active.
              </span>
            </div>
          )}

          {/* Chat Messages Body */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50">
            {/* Welcome State if no messages */}
            {messages.length === 0 && (
              <div className="py-4 space-y-4 text-center">
                <div className="h-14 w-14 rounded-3xl bg-blue-50 border border-blue-100 text-blue-600 mx-auto flex items-center justify-center shadow-xs">
                  <Sparkles className="h-7 w-7 text-blue-600" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-800 text-sm">
                    Welcome to AeroCast Voice AI
                  </h4>
                  <p className="text-xs text-slate-500 mt-1 max-w-[280px] mx-auto leading-relaxed">
                    Ask questions about Delhi NCR air quality, 72h forecasts, boundary layer dynamics, or speak with your microphone!
                  </p>
                </div>

                {/* Prompt suggestions pills */}
                <div className="grid grid-cols-1 gap-2 pt-2 text-left">
                  {promptSuggestions.map((item, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSendMessage(item.prompt)}
                      className="px-3.5 py-2.5 rounded-2xl bg-white border border-slate-200/90 text-xs text-slate-700 hover:border-blue-400 hover:bg-blue-50/50 transition-all text-left shadow-2xs group flex items-center justify-between cursor-pointer"
                    >
                      <span className="font-semibold text-slate-800">{item.title}</span>
                      <span className="text-[10px] text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity">
                        Ask &rarr;
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Conversation Messages */}
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-2.5 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {/* Assistant avatar */}
                {msg.role === 'assistant' && (
                  <div className="h-7 w-7 rounded-xl bg-slate-900 text-white flex items-center justify-center text-xs shrink-0 shadow-xs mt-0.5">
                    <Bot className="h-4 w-4 text-blue-400" />
                  </div>
                )}

                <div
                  className={`group relative max-w-[82%] rounded-2xl px-4 py-3 text-xs leading-relaxed shadow-xs ${
                    msg.role === 'user'
                      ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-tr-xs'
                      : 'bg-white border border-slate-200/80 text-slate-800 rounded-tl-xs'
                  }`}
                >
                  {/* Voice input indicator badge on user bubble */}
                  {msg.role === 'user' && msg.isVoiceInput && (
                    <div className="flex items-center gap-1 text-[10px] text-blue-200 mb-1 font-medium">
                      <Mic className="h-2.5 w-2.5" />
                      <span>Voice input</span>
                    </div>
                  )}

                  {/* Message Content */}
                  <div className="whitespace-pre-wrap">{msg.content}</div>

                  {/* Message Footer / Controls */}
                  <div
                    className={`mt-2 flex items-center justify-between gap-2 text-[10px] ${
                      msg.role === 'user' ? 'text-blue-200' : 'text-slate-400'
                    }`}
                  >
                    <span>{msg.timestamp}</span>

                    {msg.role === 'assistant' && (
                      <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                        {/* Play / Speak button */}
                        {isTtsSupported && (
                          <button
                            onClick={() => speak(msg.content)}
                            title="Read this message aloud"
                            className="p-1 rounded-md hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
                          >
                            <Volume2 className="h-3 w-3" />
                          </button>
                        )}

                        {/* Copy button */}
                        <button
                          onClick={() => handleCopy(msg.content, msg.id)}
                          title="Copy message"
                          className="p-1 rounded-md hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
                        >
                          {copiedId === msg.id ? (
                            <Check className="h-3 w-3 text-emerald-600" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* User avatar */}
                {msg.role === 'user' && (
                  <div className="h-7 w-7 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center text-xs shrink-0 shadow-xs mt-0.5">
                    <User className="h-4 w-4" />
                  </div>
                )}
              </div>
            ))}

            {/* Loading Indicator */}
            {isLoading && (
              <div className="flex items-center gap-2.5">
                <div className="h-7 w-7 rounded-xl bg-slate-900 text-white flex items-center justify-center text-xs shrink-0 shadow-xs">
                  <Bot className="h-4 w-4 text-blue-400" />
                </div>
                <div className="bg-white border border-slate-200/80 rounded-2xl rounded-tl-xs px-4 py-3 shadow-xs flex items-center gap-2 text-xs text-slate-500">
                  <span className="flex gap-1 items-center">
                    <span className="h-2 w-2 rounded-full bg-blue-600 animate-bounce [animation-delay:0ms]" />
                    <span className="h-2 w-2 rounded-full bg-indigo-600 animate-bounce [animation-delay:150ms]" />
                    <span className="h-2 w-2 rounded-full bg-purple-600 animate-bounce [animation-delay:300ms]" />
                  </span>
                  <span className="text-[11px] font-medium text-slate-400">
                    AeroCast AI is analyzing...
                  </span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input Footer */}
          <div className="p-3 bg-white border-t border-slate-200/90 shrink-0">
            <div className="flex items-center gap-2">
              {/* Clear chat button */}
              {messages.length > 0 && (
                <button
                  onClick={handleClearHistory}
                  title="Clear conversation"
                  className="p-2.5 rounded-2xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer shrink-0"
                >
                  <RefreshCw className="h-4 w-4" />
                </button>
              )}

              {/* Text Input */}
              <div className="relative flex-1">
                <input
                  ref={inputRef}
                  type="text"
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={
                    isListening
                      ? 'Listening to your voice...'
                      : 'Ask about air quality or speak...'
                  }
                  disabled={isLoading}
                  className="w-full text-xs bg-slate-100/80 border border-slate-200 rounded-2xl py-3 pl-3.5 pr-10 text-slate-800 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all"
                />

                {/* Send Button inside input */}
                <button
                  onClick={() => handleSendMessage()}
                  disabled={!inputMessage.trim() || isLoading}
                  aria-label="Send message"
                  className={`absolute right-1.5 top-1/2 -translate-y-1/2 h-7 w-7 rounded-xl flex items-center justify-center transition-all cursor-pointer ${
                    inputMessage.trim() && !isLoading
                      ? 'bg-blue-600 text-white shadow-xs hover:bg-blue-700'
                      : 'text-slate-300 hover:text-slate-400'
                  }`}
                >
                  <Send className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Microphone Toggle Button */}
              <button
                onClick={handleMicClick}
                disabled={!isSttSupported}
                title={
                  !isSttSupported
                    ? 'Speech recognition is not supported in this browser'
                    : isListening
                    ? 'Click to stop listening'
                    : 'Click to speak'
                }
                className={`relative h-10 w-10 rounded-2xl flex items-center justify-center transition-all cursor-pointer shrink-0 ${
                  !isSttSupported
                    ? 'bg-slate-100 text-slate-300 cursor-not-allowed'
                    : isListening
                    ? 'bg-rose-600 text-white shadow-lg shadow-rose-500/30 scale-105 ring-4 ring-rose-200'
                    : 'bg-slate-100 text-slate-600 hover:bg-blue-50 hover:text-blue-600'
                }`}
              >
                {isListening ? (
                  <Mic className="h-4 w-4 animate-pulse" />
                ) : isSttSupported ? (
                  <Mic className="h-4 w-4" />
                ) : (
                  <MicOff className="h-4 w-4 text-slate-300" />
                )}
              </button>
            </div>

            {/* Bottom status line */}
            <div className="flex items-center justify-between text-[10px] text-slate-400 px-1 mt-2">
              <span className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Speech Synthesis: {isTtsSupported ? (autoRead ? 'Active (Auto-Read)' : 'Muted') : 'Unavailable'}
              </span>
              <span>Web Speech API</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
export default VoiceChatbot;
