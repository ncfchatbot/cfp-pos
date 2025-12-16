import React from 'react';
import { Bot, User, AlertCircle, Copy, Check } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Role, Message } from '../types';

interface ChatMessageProps {
  message: Message;
}

const ChatMessage: React.FC<ChatMessageProps> = ({ message }) => {
  const isModel = message.role === Role.MODEL;
  const isError = message.isError;
  const [copied, setCopied] = React.useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(message.text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={`group flex w-full mb-6 ${isModel ? 'justify-start' : 'justify-end'}`}>
      <div className={`flex max-w-[85%] md:max-w-[75%] ${isModel ? 'flex-row' : 'flex-row-reverse'}`}>
        
        {/* Avatar */}
        <div className={`
          flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center mt-1
          ${isModel 
            ? isError ? 'bg-red-100 text-red-600' : 'bg-gradient-to-br from-sky-500 to-purple-600 text-white' 
            : 'bg-slate-200 text-slate-600'}
          ${isModel ? 'mr-3' : 'ml-3'}
        `}>
          {isModel ? (isError ? <AlertCircle size={16} /> : <Bot size={16} />) : <User size={16} />}
        </div>

        {/* Bubble */}
        <div className={`
          relative px-4 py-3 rounded-2xl shadow-sm text-sm md:text-base leading-relaxed overflow-hidden
          ${isModel 
            ? isError 
              ? 'bg-red-50 border border-red-100 text-red-800 rounded-tl-none' 
              : 'bg-white border border-slate-100 text-slate-800 rounded-tl-none' 
            : 'bg-sky-600 text-white rounded-tr-none'}
        `}>
          {isModel ? (
            <div className="markdown-body prose prose-sm max-w-none prose-p:my-1 prose-headings:my-2 prose-ul:my-1">
              <ReactMarkdown>{message.text}</ReactMarkdown>
            </div>
          ) : (
            <div className="whitespace-pre-wrap">{message.text}</div>
          )}

          {/* Copy Button (Model only) */}
          {isModel && !isError && (
             <button 
               onClick={handleCopy}
               className="absolute bottom-2 right-2 p-1 text-slate-400 hover:text-sky-600 opacity-0 group-hover:opacity-100 transition-opacity bg-white/80 rounded"
               title="Copy text"
             >
               {copied ? <Check size={14} /> : <Copy size={14} />}
             </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ChatMessage;