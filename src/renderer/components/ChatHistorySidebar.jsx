import React, { useState, useRef } from 'react';
import { useChat } from '../context/ChatContext';
import { Button } from './ui/button';
import { 
  MessageSquare, 
  Plus, 
  ChevronLeft, 
  ChevronRight, 
  Trash2, 
  MoreVertical,
  Clock
} from 'lucide-react';

// Format relative time for chat items
function formatRelativeTime(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Group chats by time period
function groupChatsByDate(chats) {
  const groups = {
    today: [],
    yesterday: [],
    thisWeek: [],
    thisMonth: [],
    older: []
  };

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterdayStart = new Date(todayStart - 86400000);
  const weekStart = new Date(todayStart - 6 * 86400000);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  chats.forEach(chat => {
    const chatDate = new Date(chat.updatedAt);
    
    if (chatDate >= todayStart) {
      groups.today.push(chat);
    } else if (chatDate >= yesterdayStart) {
      groups.yesterday.push(chat);
    } else if (chatDate >= weekStart) {
      groups.thisWeek.push(chat);
    } else if (chatDate >= monthStart) {
      groups.thisMonth.push(chat);
    } else {
      groups.older.push(chat);
    }
  });

  return groups;
}

function ChatHistorySidebar({ onNewChat, onChatLoaded, loading }) {
  const { 
    chatList, 
    currentChatId, 
    loadChat, 
    deleteChat, 
    isSidebarCollapsed, 
    toggleSidebar,
    isLoadingChats 
  } = useChat();
  
  const [hoveredChatId, setHoveredChatId] = useState(null);
  const [menuOpenChatId, setMenuOpenChatId] = useState(null);
  const [deletingChatId, setDeletingChatId] = useState(null);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const menuButtonRefs = useRef({});

  const handleChatClick = async (chatId) => {
    if (loading) return; // Don't switch chats while loading
    if (chatId === currentChatId) return; // Already on this chat
    const chat = await loadChat(chatId);
    if (chat) {
      const protocol = chat.useResponsesApi ? 'Responses API' : 'Chat Completions API';
      console.log(`[Chat Selected] "${chat.title || 'New Chat'}" | ID: ${chat.id} | Model: ${chat.model} | Protocol: ${protocol}`);
      if (onChatLoaded) {
        onChatLoaded(chat);
      }
    }
  };

  const handleDeleteChat = async (e, chatId) => {
    e.stopPropagation();
    setDeletingChatId(chatId);
    await deleteChat(chatId);
    setDeletingChatId(null);
    setMenuOpenChatId(null);
  };

  const handleMenuToggle = (e, chatId) => {
    e.stopPropagation();
    if (menuOpenChatId === chatId) {
      setMenuOpenChatId(null);
    } else {
      // Calculate position for fixed dropdown
      const button = menuButtonRefs.current[chatId];
      if (button) {
        const rect = button.getBoundingClientRect();
        setMenuPosition({
          top: rect.bottom + 4,
          left: rect.right - 120, // 120px is the min-width of dropdown
        });
      }
      setMenuOpenChatId(chatId);
    }
  };

  const groupedChats = groupChatsByDate(chatList);

  const renderChatGroup = (title, chats) => {
    if (chats.length === 0) return null;

    return (
      <div className="mb-4">
        {!isSidebarCollapsed && (
          <div className="px-3 py-1 text-xs font-medium text-muted-foreground uppercase tracking-wider">
            {title}
          </div>
        )}
        <div className="space-y-0.5">
          {chats.map(chat => (
            <div
              key={chat.id}
              className={`
                relative group flex items-center gap-2 px-3 py-2 cursor-pointer
                rounded-lg mx-2 transition-colors duration-150
                ${currentChatId === chat.id 
                  ? 'bg-[#E9E9DF] text-foreground' 
                  : 'hover:bg-muted/50 text-foreground/80 hover:text-foreground'}
                ${deletingChatId === chat.id ? 'opacity-50' : ''}
              `}
              onClick={() => handleChatClick(chat.id)}
              onMouseEnter={() => setHoveredChatId(chat.id)}
              onMouseLeave={() => {
                setHoveredChatId(null);
                if (menuOpenChatId === chat.id) setMenuOpenChatId(null);
              }}
            >
              <MessageSquare className="h-4 w-4 flex-shrink-0" />
              
              {!isSidebarCollapsed && (
                <>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-medium">
                        {chat.title || 'New Chat'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      <span>{formatRelativeTime(chat.updatedAt)}</span>
                    </div>
                  </div>

                  {/* Action menu */}
                  {(hoveredChatId === chat.id || menuOpenChatId === chat.id) && (
                    <div className="absolute right-2 top-1/2 -translate-y-1/2">
                      <button
                        ref={(el) => menuButtonRefs.current[chat.id] = el}
                        onClick={(e) => handleMenuToggle(e, chat.id)}
                        className="p-1 rounded hover:bg-background/80 transition-colors"
                      >
                        <MoreVertical className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                  
                  {/* Dropdown menu - rendered with fixed position to escape overflow clipping */}
                  {menuOpenChatId === chat.id && (
                    <div 
                      className="fixed py-1 bg-background border border-border rounded-md shadow-lg min-w-[120px]"
                      style={{ 
                        top: menuPosition.top, 
                        left: menuPosition.left,
                        zIndex: 9999 
                      }}
                    >
                      <button
                        onClick={(e) => handleDeleteChat(e, chat.id)}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10 transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div 
      className={`
        flex flex-col h-full bg-background border-r border-border
        transition-all duration-300 ease-in-out
        ${isSidebarCollapsed ? 'w-16' : 'w-64'}
      `}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-border">
        {!isSidebarCollapsed && (
          <h2 className="font-semibold text-sm">Chats</h2>
        )}
        <div className={`flex items-center gap-1 ${isSidebarCollapsed ? 'w-full justify-center' : ''}`}>
          <Button
            variant="ghost"
            size="icon"
            onClick={onNewChat}
            className="h-8 w-8"
            title="New Chat"
          >
            <Plus className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleSidebar}
            className="h-8 w-8"
            title={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {isSidebarCollapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>

      {/* Chat list */}
      <div className="flex-1 overflow-y-auto py-2">
        {isLoadingChats ? (
          <div className="flex items-center justify-center py-8">
            <div className="loading-spinner" />
          </div>
        ) : chatList.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            {isSidebarCollapsed ? (
              <MessageSquare className="h-6 w-6 mx-auto opacity-50" />
            ) : (
              <>
                <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No chats yet</p>
                <p className="text-xs mt-1">Start a new conversation</p>
              </>
            )}
          </div>
        ) : (
          <>
            {renderChatGroup('Today', groupedChats.today)}
            {renderChatGroup('Yesterday', groupedChats.yesterday)}
            {renderChatGroup('This Week', groupedChats.thisWeek)}
            {renderChatGroup('This Month', groupedChats.thisMonth)}
            {renderChatGroup('Older', groupedChats.older)}
          </>
        )}
      </div>
    </div>
  );
}

export default ChatHistorySidebar;

