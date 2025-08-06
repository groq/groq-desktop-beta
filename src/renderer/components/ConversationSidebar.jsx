import React, { useState, useEffect } from 'react';
import { MessageSquare, Calendar, Trash2, Edit3, Check, XIcon, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { useChat } from '../context/ChatContext';
import { cn } from '../lib/utils';

function ConversationSidebar({ isOpen, onToggle }) {
  const { 
    conversations, 
    refreshConversationsList, 
    loadConversation, 
    deleteConversation,
    updateConversationTitle,
    currentConversationId,
    startNewConversation
  } = useChat();
  
  const [editingId, setEditingId] = useState(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [loading, setLoading] = useState(false);

  // Load conversations when sidebar opens
  useEffect(() => {
    if (isOpen) {
      refreshConversationsList();
    }
  }, [isOpen, refreshConversationsList]);

  const handleLoadConversation = async (conversationId) => {
    setLoading(true);
    try {
      const result = await loadConversation(conversationId);
      if (!result.success) {
        console.error('Failed to load conversation:', result.error);
        // You could show a toast notification here
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteConversation = async (conversationId) => {
    if (window.confirm('Are you sure you want to delete this conversation? This action cannot be undone.')) {
      setLoading(true);
      try {
        const result = await deleteConversation(conversationId);
        if (!result.success) {
          console.error('Failed to delete conversation:', result.error);
          // You could show a toast notification here
        }
      } finally {
        setLoading(false);
      }
    }
  };

  const handleStartEdit = (conversation) => {
    setEditingId(conversation.id);
    setEditingTitle(conversation.title);
  };

  const handleSaveEdit = async () => {
    if (editingTitle.trim() && editingId) {
      setLoading(true);
      try {
        const result = await updateConversationTitle(editingId, editingTitle.trim());
        if (result.success) {
          setEditingId(null);
          setEditingTitle('');
        } else {
          console.error('Failed to update title:', result.error);
        }
      } finally {
        setLoading(false);
      }
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditingTitle('');
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInHours = (now - date) / (1000 * 60 * 60);
    
    if (diffInHours < 24) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (diffInHours < 24 * 7) {
      return date.toLocaleDateString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' });
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
    }
  };

  const getPreviewText = (lastMessage) => {
    if (!lastMessage) return 'No messages';
    
    if (lastMessage.role === 'user') {
      if (typeof lastMessage.content === 'string') {
        return lastMessage.content.substring(0, 60) + (lastMessage.content.length > 60 ? '...' : '');
      } else if (Array.isArray(lastMessage.content)) {
        const textParts = lastMessage.content.filter(part => part.type === 'text');
        const text = textParts.map(part => part.text).join(' ');
        return text.substring(0, 60) + (text.length > 60 ? '...' : '');
      }
    } else if (lastMessage.role === 'assistant') {
      const text = lastMessage.content || '';
      return text.substring(0, 60) + (text.length > 60 ? '...' : '');
    }
    
    return 'Message';
  };

  return (
    <>
      {/* Sidebar */}
      <div className={cn(
        "fixed left-0 top-0 bottom-0 z-40 bg-background border-r border-border/50 transition-all duration-300 ease-in-out flex flex-col",
        isOpen ? "w-80" : "w-0"
      )}>
        {/* Sidebar Header */}
        <div className={cn(
          "flex items-center justify-between p-4 border-b border-border/30 bg-background/95 backdrop-blur-sm",
          isOpen ? "opacity-100" : "opacity-0"
        )}>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <MessageSquare className="w-5 h-5" />
            History
          </h2>
          <Button 
            variant="ghost" 
            size="sm"
            onClick={() => {
              startNewConversation();
            }}
            className="text-muted-foreground hover:text-foreground"
          >
            <Plus className="w-4 h-4 mr-2" />
            New
          </Button>
        </div>

        {/* Sidebar Content */}
        <div className={cn(
          "flex-1 overflow-hidden",
          isOpen ? "opacity-100" : "opacity-0"
        )}>
          <div className="h-full overflow-y-auto scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent p-4">
            {loading && (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
              </div>
            )}

            {!loading && conversations.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                <MessageSquare className="w-8 h-8 mx-auto mb-4 opacity-50" />
                <p className="text-sm font-medium mb-2">No conversations yet</p>
                <p className="text-xs">Start chatting to create your first conversation!</p>
              </div>
            )}

            {!loading && conversations.length > 0 && (
              <div className="space-y-3">
                {conversations.map((conversation) => (
                  <div
                    key={conversation.id}
                    className={cn(
                      "group border rounded-lg p-3 hover:bg-muted/50 transition-colors cursor-pointer",
                      conversation.id === currentConversationId ? 'bg-primary/5 border-primary/20' : ''
                    )}
                    onClick={() => !editingId && handleLoadConversation(conversation.id)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        {editingId === conversation.id ? (
                          <div className="flex items-center gap-1 mb-2">
                            <Input
                              value={editingTitle}
                              onChange={(e) => setEditingTitle(e.target.value)}
                              className="h-7 text-sm"
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSaveEdit();
                                if (e.key === 'Escape') handleCancelEdit();
                              }}
                              onClick={(e) => e.stopPropagation()}
                              autoFocus
                            />
                            <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); handleSaveEdit(); }} className="h-7 w-7 p-0">
                              <Check className="w-3 h-3" />
                            </Button>
                            <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); handleCancelEdit(); }} className="h-7 w-7 p-0">
                              <XIcon className="w-3 h-3" />
                            </Button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 mb-2">
                            <h3 className="font-medium hover:text-primary transition-colors flex-1 truncate text-sm">
                              {conversation.title}
                            </h3>
                            {conversation.id === currentConversationId && (
                              <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded-full shrink-0">
                                Current
                              </span>
                            )}
                          </div>
                        )}
                        
                        <p className="text-xs text-muted-foreground mb-2 truncate leading-relaxed">
                          {getPreviewText(conversation.lastMessage)}
                        </p>
                        
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span>{conversation.messageCount} msgs</span>
                          <span className="capitalize truncate">{conversation.model.split('-')[0]}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e) => { e.stopPropagation(); handleStartEdit(conversation); }}
                          disabled={editingId !== null}
                          className="h-7 w-7 p-0"
                        >
                          <Edit3 className="w-3 h-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e) => { e.stopPropagation(); handleDeleteConversation(conversation.id); }}
                          disabled={editingId !== null}
                          className="text-destructive hover:text-destructive h-7 w-7 p-0"
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Toggle Button */}
      <Button
        variant="ghost"
        size="icon"
        onClick={onToggle}
        className={cn(
          "fixed top-20 z-50 h-8 w-8 transition-all duration-300 ease-in-out border border-border/50 bg-background/95 backdrop-blur-sm hover:bg-muted/50",
          isOpen ? "left-[312px]" : "left-2"
        )}
        title={isOpen ? "Close History" : "Open History"}
      >
        {isOpen ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
      </Button>

      {/* Overlay for mobile */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/20 backdrop-blur-sm z-30 md:hidden"
          onClick={onToggle}
        />
      )}
    </>
  );
}

export default ConversationSidebar;