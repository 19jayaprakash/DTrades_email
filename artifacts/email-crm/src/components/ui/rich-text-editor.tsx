import React, { useState, useEffect, useRef } from "react";
import { 
  Bold, Italic, Underline, Strikethrough, 
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  List, ListOrdered, Link, Heading1, Heading2, 
  Image, Code, Eye, FileText
} from "lucide-react";

interface RichTextEditorProps {
  value: string;
  onChange: (val: string) => void;
  className?: string;
  showBanners?: boolean;
  hasCustomBanner?: boolean;
}

export function RichTextEditor({ 
  value, 
  onChange, 
  className = "",
  showBanners = false,
  hasCustomBanner = false
}: RichTextEditorProps) {
  const [isHtmlMode, setIsHtmlMode] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);

  // Sync internal innerHTML when external value changes
  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== value) {
      editorRef.current.innerHTML = value || "<p><br></p>";
    }
  }, [value]);

  const handleInput = () => {
    if (editorRef.current) {
      onChange(editorRef.current.innerHTML);
    }
  };

  const execCommand = (command: string, argValue: string = "") => {
    document.execCommand(command, false, argValue);
    handleInput();
  };

  const insertImageBanner = (imagePath: string, altText: string) => {
    const bannerHtml = `<div style="text-align: center; margin: 15px 0 25px 0;"><img src="${imagePath}" alt="${altText}" style="width: 100%; max-width: 600px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);" /></div><p><br></p>`;
    
    if (isHtmlMode) {
      onChange((value || "") + bannerHtml);
    } else {
      if (editorRef.current) {
        editorRef.current.focus();
        document.execCommand("insertHTML", false, bannerHtml);
        handleInput();
      }
    }
  };

  return (
    <div className={`border rounded-lg overflow-hidden bg-white shadow-xs flex flex-col ${className}`}>
      {/* Editor Toolbar */}
      <div className="flex flex-wrap gap-1 p-2 bg-slate-50 border-b items-center justify-between">
        <div className="flex flex-wrap gap-1 items-center">
          {/* Format Buttons */}
          <button
            type="button"
            onClick={() => execCommand("bold")}
            className="p-2 hover:bg-slate-200 rounded text-slate-700 transition"
            title="Bold"
            disabled={isHtmlMode}
          >
            <Bold className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => execCommand("italic")}
            className="p-2 hover:bg-slate-200 rounded text-slate-700 transition"
            title="Italic"
            disabled={isHtmlMode}
          >
            <Italic className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => execCommand("underline")}
            className="p-2 hover:bg-slate-200 rounded text-slate-700 transition"
            title="Underline"
            disabled={isHtmlMode}
          >
            <Underline className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => execCommand("strikeThrough")}
            className="p-2 hover:bg-slate-200 rounded text-slate-700 transition"
            title="Strikethrough"
            disabled={isHtmlMode}
          >
            <Strikethrough className="h-4 w-4" />
          </button>

          <span className="w-px h-6 bg-slate-200 mx-1" />

          {/* Heading Buttons */}
          <button
            type="button"
            onClick={() => execCommand("formatBlock", "<h1>")}
            className="p-2 hover:bg-slate-200 rounded text-slate-700 transition font-bold text-xs"
            title="Heading 1"
            disabled={isHtmlMode}
          >
            <Heading1 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => execCommand("formatBlock", "<h2>")}
            className="p-2 hover:bg-slate-200 rounded text-slate-700 transition font-bold text-xs"
            title="Heading 2"
            disabled={isHtmlMode}
          >
            <Heading2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => execCommand("formatBlock", "<p>")}
            className="p-2 hover:bg-slate-200 rounded text-slate-700 transition text-xs"
            title="Paragraph"
            disabled={isHtmlMode}
          >
            <FileText className="h-4 w-4" />
          </button>

          <span className="w-px h-6 bg-slate-200 mx-1" />

          {/* Alignment */}
          <button
            type="button"
            onClick={() => execCommand("justifyLeft")}
            className="p-2 hover:bg-slate-200 rounded text-slate-700 transition"
            title="Align Left"
            disabled={isHtmlMode}
          >
            <AlignLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => execCommand("justifyCenter")}
            className="p-2 hover:bg-slate-200 rounded text-slate-700 transition"
            title="Align Center"
            disabled={isHtmlMode}
          >
            <AlignCenter className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => execCommand("justifyRight")}
            className="p-2 hover:bg-slate-200 rounded text-slate-700 transition"
            title="Align Right"
            disabled={isHtmlMode}
          >
            <AlignRight className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => execCommand("justifyFull")}
            className="p-2 hover:bg-slate-200 rounded text-slate-700 transition"
            title="Justify"
            disabled={isHtmlMode}
          >
            <AlignJustify className="h-4 w-4" />
          </button>

          <span className="w-px h-6 bg-slate-200 mx-1" />

          {/* Lists */}
          <button
            type="button"
            onClick={() => execCommand("insertUnorderedList")}
            className="p-2 hover:bg-slate-200 rounded text-slate-700 transition"
            title="Unordered List"
            disabled={isHtmlMode}
          >
            <List className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => execCommand("insertOrderedList")}
            className="p-2 hover:bg-slate-200 rounded text-slate-700 transition"
            title="Ordered List"
            disabled={isHtmlMode}
          >
            <ListOrdered className="h-4 w-4" />
          </button>

          <span className="w-px h-6 bg-slate-200 mx-1" />

          {/* Links */}
          <button
            type="button"
            onClick={() => {
              const url = prompt("Enter the URL:");
              if (url) execCommand("createLink", url);
            }}
            className="p-2 hover:bg-slate-200 rounded text-slate-700 transition"
            title="Insert Link"
            disabled={isHtmlMode}
          >
            <Link className="h-4 w-4" />
          </button>
        </div>

        {/* Mode Toggle */}
        <button
          type="button"
          onClick={() => setIsHtmlMode(!isHtmlMode)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold border transition cursor-pointer ${
            isHtmlMode 
              ? "bg-primary text-primary-foreground border-primary" 
              : "bg-white hover:bg-slate-100 text-slate-700 border-slate-200"
          }`}
          title={isHtmlMode ? "Switch to Visual Editor" : "Switch to HTML Editor"}
        >
          {isHtmlMode ? (
            <><Eye className="h-3.5 w-3.5" /> Visual</>
          ) : (
            <><Code className="h-3.5 w-3.5" /> HTML Code</>
          )}
        </button>
      </div>

      {/* Banner Injector Bar */}
      {showBanners && (
        <div className="flex flex-wrap items-center gap-2 p-2 bg-slate-100 border-b border-slate-200 text-xs">
          <span className="font-semibold text-slate-500 flex items-center gap-1">
            <Image className="h-3.5 w-3.5 text-primary" /> Insert Banner:
          </span>
          {hasCustomBanner ? (
            <button
              type="button"
              onClick={() => insertImageBanner("cid:signature_banner_image", "Signature Banner")}
              className="px-3 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 hover:text-emerald-800 border border-emerald-200 hover:border-emerald-300 rounded font-medium transition cursor-pointer flex items-center gap-1.5"
            >
              📷 Insert Uploaded Custom Banner
            </button>
          ) : (
            <span className="text-muted-foreground italic">
              No custom signature banner uploaded yet. Upload one on the right to insert.
            </span>
          )}
        </div>
      )}

      {/* Editor Body */}
      <div className="flex-1 relative min-h-[300px]">
        {isHtmlMode ? (
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="w-full h-full min-h-[300px] p-4 font-mono text-sm border-0 focus:ring-0 focus:outline-none resize-y bg-slate-900 text-slate-200"
            placeholder="Type your HTML content here..."
            style={{ display: "block", minHeight: "300px", outline: "none" }}
          />
        ) : (
          <div
            ref={editorRef}
            contentEditable
            onInput={handleInput}
            className="w-full h-full min-h-[300px] p-4 outline-none prose prose-sm max-w-none text-slate-800 bg-white overflow-y-auto"
            style={{ minHeight: "300px" }}
          />
        )}
      </div>
    </div>
  );
}
