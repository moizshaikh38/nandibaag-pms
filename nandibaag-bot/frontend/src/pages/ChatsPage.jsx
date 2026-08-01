import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams, useParams } from 'react-router-dom';
import { useSocket } from '../hooks/useSocket';
import api from '../utils/api';
import { formatPhoneDisplay, formatRelativeTime, getLanguageBadgeColor } from '../utils/formatters';
import { Search, MessageSquare, Bot, User, Flame, ChevronRight, Zap, Filter, Sparkles, Phone, Shield, RefreshCw } from 'lucide-react';
import ChatWindow from '../components/ChatWindow';
import toast from 'react-hot-toast';

export default function ChatsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { id: paramChatId } = useParams();
  const socket = useSocket();
  
  const [chats, setChats] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedChatId, setSelectedChatId] = useState(null);
  const [activeTab, setActiveTab] = useState('all'); // 'all', 'hot', 'ai', 'human'
  const [isDesktop, setIsDesktop] = useState(window.innerWidth >= 768);

  const pendingModeRequests = useRef({});

  useEffect(() => {
    const handleResize = () => {
      setIsDesktop(window.innerWidth >= 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const fetchChats = useCallback(async (search = '') => {
    try {
      if (chats.length === 0) {
        setIsLoading(true);
      }
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      
      const response = await api.get(`/chats?${params.toString()}`);
      setChats(response.data.chats || []);
    } catch (error) {
      console.error('Failed to fetch chats:', error);
    } finally {
      setIsLoading(false);
    }
  }, [chats.length]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    fetchChats(debouncedSearch);
  }, [debouncedSearch, fetchChats]);

  useEffect(() => {
    const filterFromUrl = searchParams.get('filter') || searchParams.get('tab');
    if (filterFromUrl && ['all', 'hot', 'ai', 'human'].includes(filterFromUrl)) {
      setActiveTab(filterFromUrl);
    }
    const chatIdFromUrl = paramChatId || searchParams.get('chatId');
    if (chatIdFromUrl) {
      setSelectedChatId(chatIdFromUrl);
    }
  }, [paramChatId, searchParams]);

  useEffect(() => {
    if (chats.length > 0 && !selectedChatId && isDesktop) {
      setSelectedChatId(chats[0]._id);
    }
  }, [chats, selectedChatId, isDesktop]);

  useEffect(() => {
    if (!socket) return;

    const handleChatUpdated = (updatedChatData) => {
      console.log('RECEIVED chat:updated event:', updatedChatData?._id || updatedChatData);
      setChats(prev => {
        const targetId = updatedChatData._id || updatedChatData.chatId;
        const index = prev.findIndex(c => c._id === targetId);
        if (index >= 0) {
          const newArray = [...prev];
          newArray[index] = { ...newArray[index], ...updatedChatData, lastMessageAt: new Date() };
          const [moved] = newArray.splice(index, 1);
          newArray.unshift(moved);
          return newArray;
        } else if (updatedChatData._id) {
          return [updatedChatData, ...prev];
        }
        return prev;
      });
    };

    const handleNewMessage = (data) => {
      console.log('RECEIVED chat:new_message event:', data);
      if (data.chat) {
        handleChatUpdated(data.chat);
        return;
      }
      setChats(prev => {
        const updated = prev.map(chat => {
          if (chat._id === data.chatId) {
            return {
              ...chat,
              customerName: data.customerName || chat.customerName,
              customerPhone: data.customerPhone || chat.customerPhone,
              lastMessageAt: new Date(),
              messages: [...chat.messages, {
                sender: data.sender || 'customer',
                text: data.message,
                timestamp: new Date(),
                deliveryStatus: data.deliveryStatus || 'sent'
              }]
            };
          }
          return chat;
        });
        
        const chatIndex = updated.findIndex(c => c._id === data.chatId);
        if (chatIndex > 0) {
          const [bumpedChat] = updated.splice(chatIndex, 1);
          updated.unshift(bumpedChat);
        }
        
        return updated;
      });
    };

    const handleBulkModeUpdated = (data) => {
      setChats(prev =>
        prev.map(chat => ({
          ...chat,
          mode: data.mode
        }))
      );
    };

    const handleChatModeUpdated = (data) => {
      if (!pendingModeRequests.current[data.chatId]) {
        setChats(prev =>
          prev.map(chat =>
            chat._id === data.chatId ? { ...chat, mode: data.mode } : chat
          )
        );
      }
    };

    socket.on('chat:updated', handleChatUpdated);
    socket.on('chat:new_message', handleNewMessage);
    socket.on('new_message', handleNewMessage);
    socket.on('chats:bulk_mode_updated', handleBulkModeUpdated);
    socket.on('chat:mode_updated', handleChatModeUpdated);
    
    // Backup polling safety net (every 8s)
    const pollTimer = setInterval(() => {
      fetchChats(debouncedSearch);
    }, 8000);

    return () => {
      socket.off('chat:updated', handleChatUpdated);
      socket.off('chat:new_message', handleNewMessage);
      socket.off('new_message', handleNewMessage);
      socket.off('chats:bulk_mode_updated', handleBulkModeUpdated);
      socket.off('chat:mode_updated', handleChatModeUpdated);
      clearInterval(pollTimer);
    };
  }, [socket, debouncedSearch, fetchChats]);

  const handleListRowToggle = useCallback((chatId, newModeOverride, e) => {
    if (e?.stopPropagation) e.stopPropagation();

    const chat = chats.find(c => c._id === chatId);
    if (!chat && !newModeOverride) return;

    const newMode = newModeOverride || (chat.mode === 'ai' ? 'human' : 'ai');

    setChats(prev =>
      prev.map(c => c._id === chatId ? { ...c, mode: newMode } : c)
    );

    if (newModeOverride) return;

    if (pendingModeRequests.current[chatId]) {
      pendingModeRequests.current[chatId].abort?.();
    }

    const controller = new AbortController();
    pendingModeRequests.current[chatId] = controller;

    api.patch(`/chats/${chatId}/mode`, { mode: newMode }, { signal: controller.signal })
      .then(() => {
        delete pendingModeRequests.current[chatId];
      })
      .catch((err) => {
        if (err?.code === 'ERR_CANCELED' || err?.name === 'CanceledError') return;
        delete pendingModeRequests.current[chatId];

        const revertTo = newMode === 'ai' ? 'human' : 'ai';
        setChats(prev =>
          prev.map(c => c._id === chatId ? { ...c, mode: revertTo } : c)
        );
        toast.error("Couldn't switch mode, try again");
      });
  }, [chats]);

  const handleChatSelect = (chatId) => {
    setSelectedChatId(chatId);
    if (!isDesktop) {
      navigate(`/chats/${chatId}`);
    }
  };

  // Filter computation
  const hotLeads = chats.filter(c => c.leadStatus === 'hot' || (c.leadScore && c.leadScore >= 70));
  const aiChats = chats.filter(c => c.mode === 'ai');
  const humanChats = chats.filter(c => c.mode === 'human');

  const filteredChats = chats.filter(chat => {
    if (activeTab === 'hot') return chat.leadStatus === 'hot' || (chat.leadScore && chat.leadScore >= 70);
    if (activeTab === 'ai') return chat.mode === 'ai';
    if (activeTab === 'human') return chat.mode === 'human';
    return true;
  });

  const selectedChat = chats.find(c => c._id === selectedChatId);

  return (
    <div className="h-[calc(100vh-7rem)] min-h-[600px] flex flex-col md:flex-row glass-card rounded-2xl overflow-hidden border border-slate-200 shadow-xl">
      
      {/* Chat List Panel */}
      <div className={`${selectedChat ? 'hidden md:flex' : 'flex'} w-full md:w-80 lg:w-96 flex-col bg-white border-r border-slate-200 shrink-0`}>
        
        {/* Header & Tabs */}
        <div className="p-4 border-b border-slate-100 space-y-3 bg-slate-50/50">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-display font-bold text-slate-800 flex items-center gap-2">
              <MessageSquare size={20} className="text-emerald-600" />
              <span>Resort WhatsApp Inbox</span>
            </h1>
            <span className="text-xs font-semibold px-2.5 py-1 bg-slate-100 text-slate-600 rounded-full border border-slate-200 font-mono">
              {filteredChats.length} Conversations
            </span>
          </div>

          {/* Search Input */}
          <div className="relative">
            <Search className="absolute left-3 top-2.5 text-slate-400" size={15} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search guest by name or phone..."
              className="w-full pl-9 pr-4 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-2xs"
            />
          </div>

          {/* DEDICATED HOT LEADS & CATEGORY TABS */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
            <button
              onClick={() => setActiveTab('hot')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 ${
                activeTab === 'hot'
                  ? 'bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow-md shadow-orange-500/20 scale-105'
                  : 'bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100'
              }`}
            >
              <Flame size={14} className={activeTab === 'hot' ? 'animate-bounce text-yellow-200' : 'text-amber-600'} />
              <span>Hot Leads</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                activeTab === 'hot' ? 'bg-white/20 text-white' : 'bg-amber-200 text-amber-900'
              }`}>
                {hotLeads.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all shrink-0 ${
                activeTab === 'all'
                  ? 'bg-slate-800 text-white shadow-xs'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
              }`}
            >
              All ({chats.length})
            </button>

            <button
              onClick={() => setActiveTab('ai')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1 shrink-0 ${
                activeTab === 'ai'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100'
              }`}
            >
              <Zap size={13} />
              <span>AI Bot ({aiChats.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('human')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1 shrink-0 ${
                activeTab === 'human'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-indigo-50 text-indigo-800 border border-indigo-200 hover:bg-indigo-100'
              }`}
            >
              <User size={13} />
              <span>Handover ({humanChats.length})</span>
            </button>
          </div>
        </div>

        {/* Chat List Rows */}
        <div className="flex-1 overflow-y-auto chat-scrollbar divide-y divide-slate-100">
          {isLoading ? (
            <div className="py-16 text-center space-y-3">
              <RefreshCw size={28} className="animate-spin text-emerald-600 mx-auto" />
              <p className="text-xs font-semibold text-slate-500">Loading guest messages...</p>
            </div>
          ) : filteredChats.length === 0 ? (
            <div className="py-16 text-center space-y-3 text-slate-400">
              <MessageSquare size={36} className="mx-auto text-slate-300" />
              <p className="text-xs font-semibold text-slate-600">No conversations in this section</p>
            </div>
          ) : (
            filteredChats.map((chat) => {
              const lastMessage = chat.messages?.[chat.messages.length - 1];
              const isHot = chat.leadStatus === 'hot' || (chat.leadScore && chat.leadScore >= 70);
              const isAI = chat.mode === 'ai';
              const isSelected = selectedChatId === chat._id;

              return (
                <div
                  key={chat._id}
                  onClick={() => handleChatSelect(chat._id)}
                  className={`p-3.5 cursor-pointer transition-all border-l-4 ${
                    isSelected
                      ? 'bg-emerald-50/80 border-emerald-600 shadow-2xs'
                      : isHot
                      ? 'border-amber-500 hover:bg-amber-50/50'
                      : 'border-transparent hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {/* Avatar */}
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm text-white shrink-0 shadow-xs ${
                      isHot
                        ? 'bg-gradient-to-tr from-amber-600 to-orange-500 shadow-orange-500/20'
                        : isAI
                        ? 'bg-gradient-to-tr from-emerald-600 to-teal-500 shadow-emerald-600/20'
                        : 'bg-slate-700'
                    }`}>
                      {chat.customerName?.charAt(0).toUpperCase() || chat.customerPhone?.slice(-2) || 'G'}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center justify-between">
                        <h3 className="font-display font-bold text-xs text-slate-800 truncate flex items-center gap-1.5">
                          <span>{chat.customerName || formatPhoneDisplay(chat.customerPhone)}</span>
                          {isHot && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded-md bg-amber-100 text-amber-900 text-[10px] font-bold border border-amber-300">
                              <Flame size={10} className="text-orange-600 fill-orange-500" />
                              <span>Hot</span>
                            </span>
                          )}
                        </h3>
                        <span className="text-[10px] text-slate-400 shrink-0 font-medium">
                          {formatRelativeTime(chat.lastMessageAt || chat.updatedAt)}
                        </span>
                      </div>

                      <p className="text-xs text-slate-500 truncate leading-tight">
                        {lastMessage?.text || 'No messages yet'}
                      </p>

                      <div className="flex items-center justify-between pt-1">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-bold border shrink-0 ${
                            chat.channel === 'fast2sms'
                              ? 'bg-sky-50 text-sky-700 border-sky-200'
                              : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          }`} title={chat.channel === 'fast2sms' ? 'Fast2SMS WhatsApp Business channel' : 'WhatsApp Web channel'}>
                            {chat.channel === 'fast2sms' ? '📡 Fast2SMS' : '📱 WhatsApp Web'}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono truncate">
                            {formatPhoneDisplay(chat.customerPhone)}
                          </span>
                        </div>

                        {/* Mode Toggle Button */}
                        <button
                          onClick={(e) => handleListRowToggle(chat._id, null, e)}
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full border transition-all flex items-center gap-1 ${
                            isAI
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                              : 'bg-indigo-50 text-indigo-800 border-indigo-200 hover:bg-indigo-100'
                          }`}
                          title="Click to toggle AI / Human mode"
                        >
                          {isAI ? <Zap size={10} /> : <User size={10} />}
                          <span>{isAI ? 'AI Auto' : 'Staff'}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Main Workspace Panel */}
      <div className={`${selectedChat ? 'flex' : 'hidden md:flex'} flex-1 flex-col bg-slate-100 min-w-0`}>
        {selectedChat ? (
          <ChatWindow
            chat={selectedChat}
            onClose={() => setSelectedChatId(null)}
            onModeChange={(newMode) => handleListRowToggle(selectedChat._id, newMode)}
            onChatUpdated={(updatedChat) => {
              setChats(prev => {
                const index = prev.findIndex(c => c._id === updatedChat._id);
                if (index >= 0) {
                  const newArr = [...prev];
                  newArr[index] = { ...newArr[index], ...updatedChat, lastMessageAt: new Date() };
                  const [moved] = newArr.splice(index, 1);
                  newArr.unshift(moved);
                  return newArr;
                }
                return [updatedChat, ...prev];
              });
            }}
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-3">
            <div className="w-16 h-16 rounded-2xl bg-white text-emerald-600 flex items-center justify-center shadow-md border border-slate-200">
              <MessageSquare size={32} />
            </div>
            <h3 className="font-display font-bold text-lg text-slate-800">Select a Guest Conversation</h3>
            <p className="text-xs text-slate-500 max-w-sm">
              Click any guest conversation on the left panel or choose **🔥 Hot Leads** to manage high-converting bookings.
            </p>
          </div>
        )}
      </div>

    </div>
  );
}
