"use client";
import React, { useState, useEffect, useRef } from "react";
import {
  Send,
  Mic,
  Upload,
  Copy,
  Bell,
  Menu,
  X,
  FileText,
  Trash2,
  RefreshCw,
  CloudUpload,
  MessageSquare,
  Settings,
  LogOut,
  History,
  Crown,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
} from "lucide-react";

const API_BASE = "http://localhost:8000/api";

export default function DocumentChatApp() {
  // State management
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [historyDrawerOpen, setHistoryDrawerOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [chatStatus, setChatStatus] = useState({
    vectorstore_available: false,
    document_count: 0,
  });
  const [dragOver, setDragOver] = useState(false);
  const [notification, setNotification] = useState("");
  const [copiedIndex, setCopiedIndex] = useState(null);
  const [typingDots, setTypingDots] = useState(0);
  const [currentPage, setCurrentPage] = useState(0);
  const [chatSessions, setChatSessions] = useState([]);
  const [currentSessionId, setCurrentSessionId] = useState(null);

  const fileInputRef = useRef(null);
  const messagesEndRef = useRef(null);

  const filesPerPage = 2;
  const totalPages = Math.ceil(uploadedFiles.length / filesPerPage);
  const currentFiles = uploadedFiles.slice(
    currentPage * filesPerPage,
    (currentPage + 1) * filesPerPage
  );

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Typing animation effect
  useEffect(() => {
    if (loading) {
      const interval = setInterval(() => {
        setTypingDots((prev) => (prev + 1) % 4);
      }, 500);
      return () => clearInterval(interval);
    }
  }, [loading]);

  // Load initial data
  useEffect(() => {
    loadUploadedFiles();
    checkChatStatus();
    loadChatSessions();
  }, []);

  // Reset pagination when files change
  useEffect(() => {
    if (currentPage >= totalPages && totalPages > 0) {
      setCurrentPage(totalPages - 1);
    }
  }, [uploadedFiles.length, totalPages, currentPage]);

  // API Functions
  const loadUploadedFiles = async () => {
    try {
      const response = await fetch(`${API_BASE}/documents/list`);
      const data = await response.json();
      setUploadedFiles(data.files || []);
    } catch (error) {
      showNotification("Error loading files");
    }
  };

  const checkChatStatus = async () => {

    try {
  
      const response = await fetch(`${API_BASE}/chat/status`);
  
      
  
      if (!response.ok) {
  
        throw new Error(`HTTP error! status: ${response.status}`);
  
      }
  
      
  
      const data = await response.json();
  
      
  
      // Validate the response structure
  
      const validatedData = {
  
        vectorstore_available: data.vectorstore_available || false,
  
        document_count: data.document_count || 0,
  
      };
  
      
  
      setChatStatus(validatedData);
  
    } catch (error) {
  
      console.error("Error checking chat status:", error);
  
      
  
      // Set default values on error
  
      setChatStatus({
  
        vectorstore_available: false,
  
        document_count: 0,
  
      });
  
      
  
      // Optional: Show notification to user
  
      showNotification("Unable to check system status");
  
    }
  
  };

  const loadChatSessions = async () => {
    try {
      const response = await fetch(`${API_BASE}/chat/sessions`);
      const data = await response.json();
      setChatSessions(data.sessions || []);
    } catch (error) {
      console.error("Error loading chat sessions:", error);
    }
  };

  const loadChatSession = async (sessionId) => {
    try {
      const response = await fetch(`${API_BASE}/chat/sessions/${sessionId}`);
      const data = await response.json();
      setMessages(data.messages || []);
      setCurrentSessionId(sessionId);
    } catch (error) {
      showNotification("Error loading chat session");
    }
  };

  const createNewChat = async () => {
    if (currentSessionId && messages.length === 0) {
      showNotification("You already have an empty chat open");
      return;
    }
  
    try {
      const response = await fetch(`${API_BASE}/chat/new-session`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: "New Chat",
        }),
      });
  
      const data = await response.json();
  
      if (response.ok) {
        setMessages([]);
        setCurrentSessionId(data.session_id);
        loadChatSessions(); // Refresh sessions list
        showNotification("New chat created");
      }
    } catch (error) {
      showNotification("Error creating new chat");
    }
  };

  const deleteChatSession = async (sessionId) => {
    try {
      const response = await fetch(`${API_BASE}/chat/sessions/${sessionId}`, {
        method: "DELETE",
      });

      if (response.ok) {
        loadChatSessions();
        if (currentSessionId === sessionId) {
          setMessages([]);
          setCurrentSessionId(null);
        }
        showNotification("Chat session deleted");
      }
    } catch (error) {
      showNotification("Error deleting session");
    }
  };

  const uploadFile = async (file) => {
    const formData = new FormData();
    formData.append("file", file);

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/documents/upload`, {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (response.ok) {
        showNotification(`File ${file.name} uploaded successfully!`);
        loadUploadedFiles();
        checkChatStatus();

        // Refresh vectorstore to include new document
        try {
          await fetch(`${API_BASE}/chat/refresh-vectorstore`, {
            method: "POST",
          });
        } catch (refreshError) {
          console.warn("Failed to refresh vectorstore:", refreshError);
        }
      } else {
        showNotification(data.detail || "Upload failed");
      }
    } catch (error) {
      showNotification("Upload error: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const sendMessage = async () => {
    if (!inputMessage.trim() || loading) return;

    const userMessage = { role: "user", content: inputMessage };
    setMessages((prev) => [...prev, userMessage]);
    setInputMessage("");
    setLoading(true);

    try {
      const response = await fetch(`${API_BASE}/chat/query`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: inputMessage,
          session_id: currentSessionId,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        const assistantMessage = {
          role: "assistant",
          content: data.response,
          sources: data.source_documents,
        };
        setMessages((prev) => [...prev, assistantMessage]);
        setCurrentSessionId(data.session_id);
        loadChatSessions(); // Refresh sessions list
      } else {
        showNotification(data.detail || "Failed to get response");
      }
    } catch (error) {
      showNotification("Chat error: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const deleteFile = async (filename) => {
    try {
      const response = await fetch(`${API_BASE}/documents/delete/${filename}`, {
        method: "DELETE",
      });

      if (response.ok) {
        showNotification(`File ${filename} deleted`);
        loadUploadedFiles();
        checkChatStatus();
      } else {
        showNotification("Failed to delete file");
      }
    } catch (error) {
      showNotification("Delete error: " + error.message);
    }
  };

  const reprocessDocuments = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/documents/reprocess`, {
        method: "POST",
      });

      if (response.ok) {
        showNotification("Documents reprocessed successfully!");
        checkChatStatus();
      } else {
        showNotification("Failed to reprocess documents");
      }
    } catch (error) {
      showNotification("Reprocess error: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const showNotification = (message) => {
    setNotification(message);
    setTimeout(() => setNotification(""), 3000);
  };

  // File handling
  const handleFileSelect = (event) => {
    const files = Array.from(event.target.files);
    files.forEach(uploadFile);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    files.forEach(uploadFile);
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const copyToClipboard = (text, index) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    showNotification("Copied to clipboard!");
    setTimeout(() => setCopiedIndex(null), 1000);
  };

  const Tooltip = ({ children, text, position = "top" }) => (
    <div className="group relative inline-block">
      {children}
      <div
        className={`absolute z-50 px-2 py-1 text-xs text-white bg-gray-800 rounded-md opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap
        ${
          position === "top"
            ? "bottom-full left-1/2 transform -translate-x-1/2 mb-1"
            : ""
        }
        ${
          position === "bottom"
            ? "top-full left-1/2 transform -translate-x-1/2 mt-1"
            : ""
        }
        ${
          position === "left"
            ? "right-full top-1/2 transform -translate-y-1/2 mr-1"
            : ""
        }
        ${
          position === "right"
            ? "left-full top-1/2 transform -translate-y-1/2 ml-1"
            : ""
        }
      `}
      >
        {text}
        <div
          className={`absolute w-0 h-0 border-2 border-transparent border-gray-800
          ${
            position === "top"
              ? "top-full left-1/2 transform -translate-x-1/2 border-t-gray-800 border-b-0"
              : ""
          }
          ${
            position === "bottom"
              ? "bottom-full left-1/2 transform -translate-x-1/2 border-b-gray-800 border-t-0"
              : ""
          }
          ${
            position === "left"
              ? "left-full top-1/2 transform -translate-y-1/2 border-l-gray-800 border-r-0"
              : ""
          }
          ${
            position === "right"
              ? "right-full top-1/2 transform -translate-y-1/2 border-r-gray-800 border-l-0"
              : ""
          }
        `}
        ></div>
      </div>
    </div>
  );

  // Typing animation component
  const TypingAnimation = () => (
    <div className="flex items-center space-x-1 p-4">
      <div className="flex space-x-1">
        {[0, 1, 2].map((dot) => (
          <div
            key={dot}
            className={`w-2 h-2 bg-gray-400 rounded-full transition-opacity duration-300 ${
              typingDots > dot ? "opacity-100" : "opacity-30"
            }`}
            style={{
              animationDelay: `${dot * 0.2}s`,
              animation: loading ? "pulse 1.5s infinite" : "none",
            }}
          />
        ))}
      </div>
      <span className="text-sm text-gray-500 ml-2">AI is thinking...</span>
    </div>
  );

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* Left Sidebar */}
      <div
        className={`${
          sidebarOpen ? "w-80" : "w-0"
        } transition-all duration-300 bg-gray-900 text-white flex flex-col overflow-hidden`}
      >
        <div className="p-4 border-b border-gray-700 flex-shrink-0">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center">
              <MessageSquare size={20} />
            </div>
            <span className="font-semibold text-lg">DocChat AI</span>
          </div>

          <button
            onClick={createNewChat}
            className="w-full bg-green-600 hover:bg-green-700 text-white py-2 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors mb-4"
          >
            <MessageSquare size={18} />
            New Chat
          </button>

          {/* Pro Plan Card */}
          <div className="bg-gradient-to-r from-orange-500 to-pink-500 rounded-xl p-4 mb-4">
            <div className="flex items-center gap-2 mb-2">
              <Crown size={20} />
              <span className="font-semibold">Pro Plan</span>
            </div>
            <p className="text-sm opacity-90 mb-3">
              Strengthen artificial intelligence, get plan!
            </p>
            <div className="flex items-center justify-between">
              <span className="text-lg font-bold">
                $10 <span className="text-sm">/mo</span>
              </span>
              <button className="bg-white text-orange-500 px-4 py-1 rounded-lg font-medium text-sm">
                Get
              </button>
            </div>
          </div>
        </div>

        {/* Upload Section */}
        <div className="p-4 border-b border-gray-700 flex-shrink-0">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors"
          >
            <CloudUpload size={20} />
            Upload Documents
          </button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            multiple
            accept=".pdf,.txt,.docx,.md"
            className="hidden"
          />
          <p className="text-xs text-gray-400 mt-2 text-center">
            Supports: PDF, TXT, DOCX, MD
          </p>
        </div>

        {/* Status */}
        <div className="p-4 border-b border-gray-700 flex-shrink-0">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">System Status</span>
            <div
              className={`w-2 h-2 rounded-full ${
                chatStatus.vectorstore_available
                  ? "bg-green-500"
                  : "bg-yellow-500"
              }`}
            ></div>
          </div>
          <p className="text-xs text-gray-400">
            Documents: {chatStatus.document_count} |{" "}
            {chatStatus.vectorstore_available ? "Ready" : "No Documents"}
          </p>
          <button
            onClick={reprocessDocuments}
            disabled={loading || uploadedFiles.length === 0}
            className="mt-2 w-full bg-gray-700 hover:bg-gray-600 text-white py-2 px-3 rounded-lg flex items-center justify-center gap-2 text-sm transition-colors disabled:opacity-50"
          >
            <RefreshCw size={16} />
            Reprocess
          </button>
        </div>

        {/* Files List with Pagination */}
        <div className="flex-1 flex flex-col min-h-0">
          <div className="p-3 pb-2 flex-shrink-0">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium">
                Uploaded Files ({uploadedFiles.length})
              </h3>
              {totalPages > 1 && (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setCurrentPage(Math.max(0, currentPage - 1))}
                    disabled={currentPage === 0}
                    className="p-1 hover:bg-gray-800 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <span className="text-xs text-gray-400 px-2">
                    {currentPage + 1}/{totalPages}
                  </span>
                  <button
                    onClick={() =>
                      setCurrentPage(Math.min(totalPages - 1, currentPage + 1))
                    }
                    disabled={currentPage === totalPages - 1}
                    className="p-1 hover:bg-gray-800 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="px-3 flex-1 overflow-hidden">
            <div className="h-full flex flex-col justify-start">
              <div className="space-y-2">
                {currentFiles.map((filename, index) => (
                  <div
                    key={index}
                    className="bg-gray-800 rounded-lg p-3 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <FileText
                        size={16}
                        className="text-blue-400 flex-shrink-0"
                      />
                      <span className="text-sm truncate" title={filename}>
                        {filename}
                      </span>
                    </div>
                    <Tooltip text="Delete file" position="left">
                      <button
                        onClick={() => deleteFile(filename)}
                        className="text-red-400 hover:text-red-300 p-1 flex-shrink-0"
                      >
                        <Trash2 size={14} />
                      </button>
                    </Tooltip>
                  </div>
                ))}
                {uploadedFiles.length === 0 && (
                  <p className="text-gray-400 text-sm text-center py-4">
                    No files uploaded yet
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Menu */}
        <div className="p-1 border-t border-gray-700 flex-shrink-0">
          <div className="space-y-2">
            <Tooltip text="Settings" position="right">
              <button className="w-full text-left px-3 py-1.5 rounded-lg hover:bg-gray-800 flex items-center gap-3 text-sm">
                <Settings size={16} />
                Settings
              </button>
            </Tooltip>
            <Tooltip text="Logout" position="right">
              <button className="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-800 flex items-center gap-3 text-sm text-red-400">
                <LogOut size={16} />
                Log out
              </button>
            </Tooltip>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-4">
            <Tooltip
              text={sidebarOpen ? "Close sidebar" : "Open sidebar"}
              position="bottom"
            >
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                {sidebarOpen ? <ChevronLeft size={20} /> : <Menu size={20} />}
              </button>
            </Tooltip>
            <h1 className="text-xl font-semibold text-gray-800">
              AI Chat Helper
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <Tooltip text="Notifications" position="bottom">
              <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                <Bell size={20} className="text-gray-600" />
              </button>
            </Tooltip>
            <Tooltip
              text={historyDrawerOpen ? "Close history" : "Open history"}
              position="bottom"
            >
              <button
                onClick={() => setHistoryDrawerOpen(!historyDrawerOpen)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                {historyDrawerOpen ? (
                  <ChevronRight size={20} />
                ) : (
                  <History size={20} />
                )}
              </button>
            </Tooltip>
          </div>
        </div>

        {/* Loading Bar */}
        {loading && (
          <div className="h-1 flex-shrink-0">
            <div className="h-full bg-blue-500 animate-pulse"></div>
          </div>
        )}

        {/* Notification */}
        {notification && (
          <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-2 text-sm flex-shrink-0">
            {notification}
          </div>
        )}

        {/* Drag Overlay */}
        {dragOver && (
          <div
            className="fixed inset-0 bg-blue-500 bg-opacity-10 flex items-center justify-center z-50 backdrop-blur-sm"
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <div className="bg-white rounded-xl p-8 border-2 border-dashed border-blue-500 text-center">
              <CloudUpload size={48} className="text-blue-500 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-gray-800 mb-2">
                Drop files here to upload
              </h3>
              <p className="text-gray-600">Supports PDF, TXT, DOCX, MD files</p>
            </div>
          </div>
        )}

        {/* Messages Area */}
        <div
          className="flex-1 min-h-0 p-4"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <div className="h-full overflow-y-auto">
            {messages.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  {!chatStatus.vectorstore_available ? (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 max-w-md">
                      <MessageSquare
                        size={48}
                        className="text-blue-500 mx-auto mb-4"
                      />
                      <h3 className="text-lg font-semibold text-gray-800 mb-2">
                        Welcome!
                      </h3>
                      <p className="text-gray-600">
                        Please upload some documents to start chatting.
                      </p>
                    </div>
                  ) : (
                    <div>
                      <MessageSquare
                        size={48}
                        className="text-gray-400 mx-auto mb-4"
                      />
                      <h3 className="text-lg font-semibold text-gray-800 mb-2">
                        Ready to chat!
                      </h3>
                      <p className="text-gray-600">
                        Ask questions about your uploaded documents
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="max-w-4xl mx-auto space-y-4 pb-4">
                {messages.map((message, index) => (
                  <div
                    key={index}
                    className={`flex ${
                      message.role === "user" ? "justify-end" : "justify-start"
                    }`}
                  >
                    <div
                      className={`max-w-3xl rounded-2xl px-4 py-3 ${
                        message.role === "user"
                          ? "bg-blue-500 text-white"
                          : "bg-white border border-gray-200 text-gray-800"
                      }`}
                    >
                      <div className="whitespace-pre-wrap">
                        {message.content}
                      </div>
                      {message.role === "assistant" && (
                        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
                          <Tooltip
                            text={
                              copiedIndex === index
                                ? "Copied!"
                                : "Copy response"
                            }
                            position="top"
                          >
                            <button
                              onClick={() =>
                                copyToClipboard(message.content, index)
                              }
                              className="p-1 hover:bg-gray-100 rounded transition-colors"
                            >
                              {copiedIndex === index ? (
                                <Check size={16} className="text-green-500" />
                              ) : (
                                <Copy size={16} className="text-gray-500" />
                              )}
                            </button>
                          </Tooltip>
                          {message.sources && message.sources.length > 0 && (
                            <span className="text-xs text-gray-500">
                              Sources: {message.sources.length} document(s)
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {loading && (
                  <div className="flex justify-start">
                    <div className="bg-white border border-gray-200 rounded-2xl">
                      <TypingAnimation />
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>
        </div>

        {/* Input Area */}
        <div className="bg-white border-t border-gray-200 p-4 flex-shrink-0">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-end gap-3 bg-gray-50 rounded-2xl p-3">
              <Tooltip text="Upload file" position="top">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  <Upload size={20} className="text-gray-600" />
                </button>
              </Tooltip>
              <textarea
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder={
                  chatStatus.vectorstore_available
                    ? "Ask a question about your documents..."
                    : "Upload documents first to start chatting"
                }
                disabled={!chatStatus.vectorstore_available || loading}
                className="flex-1 bg-transparent border-none outline-none resize-none max-h-32 text-gray-800 placeholder-gray-500"
                rows="1"
              />
              <Tooltip text="Voice input" position="top">
                <button className="p-2 hover:bg-gray-200 rounded-lg transition-colors">
                  <Mic size={20} className="text-gray-600" />
                </button>
              </Tooltip>
              <Tooltip text="Send message" position="top">
                <button
                  onClick={sendMessage}
                  disabled={
                    !inputMessage.trim() ||
                    !chatStatus.vectorstore_available ||
                    loading
                  }
                  className="bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 text-white p-2 rounded-lg transition-colors"
                >
                  <Send size={20} />
                </button>
              </Tooltip>
            </div>
          </div>
        </div>
      </div>

      {/* Right History Drawer */}
      <div
        className={`${
          historyDrawerOpen ? "w-80" : "w-0"
        } transition-all duration-300 bg-white border-l border-gray-200 flex flex-col overflow-hidden`}
      >
        <div className="p-4 border-b border-gray-200 flex-shrink-0">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-800">History</h2>
            <span className="text-sm text-gray-500">
              {chatSessions.length}/50
            </span>
          </div>
        </div>

        <div className="flex-1 min-h-0">
          <div className="h-full overflow-y-auto p-4">
            <div className="space-y-3">
              {chatSessions.map((session) => (
                <div
                  key={session.id}
                  className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                    currentSessionId === session.id
                      ? "bg-blue-50 border-blue-200"
                      : "bg-gray-50 border-gray-100 hover:bg-gray-100"
                  }`}
                  onClick={() => loadChatSession(session.id)}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Clock size={14} className="text-gray-400" />
                      <span className="text-xs text-gray-500">
                        {new Date(session.last_updated).toLocaleDateString()}
                      </span>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteChatSession(session.id);
                      }}
                      className="text-red-400 hover:text-red-600 p-1"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                  <h4 className="font-medium text-sm text-gray-800">
                    {session.title}
                  </h4>
                  <p className="text-xs text-gray-600 mt-1">
                    {session.message_count} messages
                  </p>
                </div>
              ))}
              {chatSessions.length === 0 && (
                <p className="text-gray-400 text-sm text-center py-4">
                  No chat history yet
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
