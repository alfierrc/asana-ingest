import React, { useState, useRef, useEffect } from 'react';
import { extractTaskGid, processTask, generateMarkdown } from './services/asanaService';
import { LogEntry } from './types';
import { Input } from './components/Input';
import { Button } from './components/Button';
import { Terminal, Copy, Check, FileText, AlertCircle, Key, Link as LinkIcon, Download } from 'lucide-react';

const App: React.FC = () => {
  // State
  const [url, setUrl] = useState('');
  // Initialize token from localStorage if available
  const [token, setToken] = useState(() => localStorage.getItem('asana_pat') || '');
  const [isLoading, setIsLoading] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [markdown, setMarkdown] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const logsEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll logs
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // Persist token to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('asana_pat', token);
  }, [token]);

  // Logging helper
  const addLog = (message: string, type: 'info' | 'success' | 'error' = 'info') => {
    setLogs(prev => [...prev, {
      id: Math.random().toString(36).substring(7),
      message,
      type,
      timestamp: Date.now()
    }]);
  };

  // Main Action
  const handleGenerate = async () => {
    // Reset state
    setError(null);
    setMarkdown(null);
    setLogs([]);
    setIsLoading(true);

    // Validation
    if (!token.trim()) {
      setError('Please enter your Asana Personal Access Token.');
      setIsLoading(false);
      return;
    }

    const taskGid = extractTaskGid(url);
    if (!taskGid) {
      setError('Invalid Asana URL. Could not extract Task ID.');
      setIsLoading(false);
      return;
    }

    try {
      addLog('Starting ingestion process...', 'info');
      addLog(`Target Task ID: ${taskGid}`, 'info');

      // Execute recursive fetch
      const enrichedTask = await processTask(taskGid, token, addLog);

      addLog('Processing complete. Generating Markdown...', 'success');
      
      const md = generateMarkdown(enrichedTask);
      setMarkdown(md);

    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred.');
      addLog(`Failed: ${err.message}`, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // Copy to Clipboard
  const handleCopy = () => {
    if (markdown) {
      navigator.clipboard.writeText(markdown);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    }
  };

  // Download File
  const handleDownload = () => {
      if (markdown) {
          const blob = new Blob([markdown], { type: 'text/markdown' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `asana-ingest-${Date.now()}.md`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
      }
  }

  return (
    <div className="min-h-screen flex flex-col items-center py-12 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto">
      
      {/* Header */}
      <div className="text-center mb-12">
        <h1 className="text-4xl font-extrabold tracking-tight text-white sm:text-5xl mb-4 bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-indigo-500">
          Git-Ingest for Asana
        </h1>
        <p className="text-lg text-textMuted max-w-2xl mx-auto">
          Convert complex Asana task hierarchies into clean Markdown for LLM context injection.
          100% client-side. Your tokens never leave your browser.
        </p>
      </div>

      <div className="w-full grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Left Column: Input & Controls */}
        <div className="flex flex-col gap-6">
          <div className="bg-surface border border-border rounded-xl p-6 shadow-2xl">
            <h2 className="text-xl font-semibold text-white mb-6 flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" />
              Configuration
            </h2>
            
            <div className="space-y-5">
              <Input
                label="Asana Task URL"
                placeholder="https://app.asana.com/0/12345/67890"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                disabled={isLoading}
              />
              
              <Input
                label="Personal Access Token (PAT)"
                type="password"
                placeholder="1/123456789..."
                value={token}
                onChange={(e) => setToken(e.target.value)}
                disabled={isLoading}
              />

              <div className="bg-zinc-900/50 rounded-lg p-3 border border-border/50 text-xs text-textMuted flex justify-between items-center">
                 <span>Note: Create a PAT in Asana Developer Console. Ensure it has access to the workspace of the task.</span>
                 <span className="text-green-500/80 font-mono text-[10px] uppercase tracking-wider border border-green-900/50 bg-green-900/10 px-1.5 py-0.5 rounded">
                    Auto-saved
                 </span>
              </div>

              {error && (
                <div className="p-3 bg-red-900/20 border border-red-900/50 rounded-lg text-red-200 text-sm flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <Button 
                onClick={handleGenerate} 
                isLoading={isLoading} 
                className="w-full"
                icon={<Terminal className="w-4 h-4" />}
              >
                {isLoading ? 'Ingesting Task...' : 'Generate Context'}
              </Button>
            </div>
          </div>

          {/* Progress Logs */}
          <div className="bg-black/50 border border-border rounded-xl p-4 font-mono text-sm h-64 overflow-y-auto shadow-inner custom-scrollbar relative">
             <div className="sticky top-0 bg-black/90 backdrop-blur pb-2 border-b border-white/5 mb-2 flex items-center gap-2 text-textMuted text-xs uppercase tracking-widest">
                <Terminal className="w-3 h-3" />
                Process Log
             </div>
             {logs.length === 0 && (
                 <div className="text-zinc-600 italic pt-4 text-center">Waiting to start...</div>
             )}
             <div className="space-y-1.5">
                {logs.map((log) => (
                  <div key={log.id} className={`break-words ${
                      log.type === 'error' ? 'text-red-400' : 
                      log.type === 'success' ? 'text-green-400' : 'text-zinc-300'
                  }`}>
                    <span className="text-zinc-600 mr-2">[{new Date(log.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}]</span>
                    {log.type === 'success' && '✨ '}
                    {log.type === 'error' && '❌ '}
                    {log.message}
                  </div>
                ))}
                <div ref={logsEndRef} />
             </div>
          </div>
        </div>

        {/* Right Column: Output */}
        <div className="flex flex-col h-full min-h-[500px]">
          <div className="bg-surface border border-border rounded-xl shadow-2xl flex flex-col h-full overflow-hidden">
            {/* Toolbar */}
            <div className="border-b border-border bg-zinc-900/50 p-4 flex justify-between items-center backdrop-blur-sm">
               <h2 className="font-semibold text-white flex items-center gap-2">
                 <FileText className="w-5 h-5 text-green-500" />
                 Markdown Output
               </h2>
               <div className="flex gap-2">
                  <Button 
                     variant="secondary" 
                     className="px-3 py-1.5 text-xs h-auto"
                     onClick={handleDownload}
                     disabled={!markdown}
                     icon={<Download className="w-3 h-3"/>}
                  >
                      Save
                  </Button>
                  <Button 
                     variant={isCopied ? "primary" : "secondary"}
                     className={`px-3 py-1.5 text-xs h-auto ${isCopied ? "bg-green-600 hover:bg-green-700 ring-green-600" : ""}`}
                     onClick={handleCopy}
                     disabled={!markdown}
                     icon={isCopied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  >
                      {isCopied ? 'Copied' : 'Copy'}
                  </Button>
               </div>
            </div>

            {/* Editor/Preview Area */}
            <div className="flex-1 relative bg-[#0d0d0d]">
              {markdown ? (
                <textarea 
                  readOnly 
                  className="w-full h-full bg-transparent text-zinc-300 p-6 font-mono text-sm resize-none focus:outline-none custom-scrollbar leading-relaxed"
                  value={markdown}
                />
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-700">
                  <FileText className="w-16 h-16 mb-4 opacity-20" />
                  <p>Output will appear here</p>
                </div>
              )}
            </div>
            
            {/* Footer Status */}
            <div className="border-t border-border bg-zinc-900/50 p-2 px-4 text-xs text-textMuted flex justify-between">
                <span>{markdown ? `${markdown.length} characters` : '0 characters'}</span>
                <span>Markdown Format</span>
            </div>
          </div>
        </div>

      </div>
      
      {/* Simple Footer */}
      <div className="mt-12 text-zinc-600 text-sm">
         Processing happens locally. No data is sent to any server other than Asana's API.
      </div>
    </div>
  );
};

export default App;