import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import rehypeKatex from 'rehype-katex';
import "katex/dist/katex.min.css";

const newLineRegex = /\n/;
const newLineAtTheEndRegex = /\n$/;
const codeLanguageRegex = /language-(\w+)/;
const imageFileExtensionsRegex = /\.(jpg|jpeg|png|gif|bmp|webp|svg)$/i;
const components = {
          span: ({ node, children, ...props }) => {
            // Apply word-wrap styles to KaTeX elements to prevent overflow
            if (props.className && props.className.includes('katex')) {
              return (
                <span 
                  {...props} 
                  style={{
                    wordWrap: 'break-word',
                    overflowWrap: 'break-word',
                    wordBreak: 'break-all',
                    ...props.style
                  }}
                >
                  {children}
                </span>
              );
            }
            return <span {...props}>{children}</span>;
          },
          // Custom renderer for code blocks to add syntax highlighting
          code({ node, inline, className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || '');
            return !inline && match ? (
              <SyntaxHighlighter
                style={oneDark} // Apply the chosen theme
                language={match[1]}
                PreTag="div"
                className="rounded-xl"
                {...props}
              >
                {String(children).replace(/\n$/, '')}
              </SyntaxHighlighter>
            ) : (
              <code className={className} {...props}>
                {children}
              </code>
            );
          },
          h1: ({ node: _, children, ...props }) => (
            <h1 className="text-3xl font-bold mb-4 mt-10" {...props}>
              {children}
            </h1>
          ),
          h2: ({ node: _, children, ...props }) => (
            <h2 className="text-2xl font-semibold mb-3 mt-9" {...props}>
              {children}
            </h2>
          ),
          h3: ({ node: _, children, ...props }) => (
            <h3 className="text-xl font-medium mb-3 mt-8" {...props}>
              {children}
            </h3>
          ),
          h4: ({ node: _, children, ...props }) => (
            <h4 className="text-lg font-medium mb-2 mt-7" {...props}>
              {children}
            </h4>
          ),
          h5: ({ node: _, children, ...props }) => (
            <h5 className="text-base font-medium mb-2 mt-7" {...props}>
              {children}
            </h5>
          ),
          h6: ({ node: _, children, ...props }) => (
            <h6 className="text-sm font-medium mb-1 mt-6" {...props}>
              {children}
            </h6>
          ),
          tr: ({ node: _, ...props }) => <tr className="border-b" {...props} />,
          td: ({ node: _, children, ...props }) => {
            return (
              <td
                className="border-r border-gray-200 p-2 font-normal first:border-l text-left"
                {...props}
              >
                {children}
              </td>
            );
          },
          th: ({ node: _, children, ...props }) => {
            return (
              <th
                className="border-r border-gray-200 p-2 font-medium first:border-l border-t text-left"
                {...props}
              >
                {children}
              </th>
            );
          },
          table: ({ node: _, ...props }) => (
            <table className="table-auto w-full mb-1" {...props} />
          ),
          thead: ({ node: _, ...props }) => (
            <thead className="bg-gray-100 dark:bg-shallow text-left" {...props} />
          ),
          tbody: ({ node: _, ...props }) => <tbody {...props} />,
          ol: ({ node: _, children, ...props }) => {
            return (
              <ol
                className="ml-0 mb-1 list-decimal"
                {...props}
              >
                {children}
              </ol>
            );
          },
          ul: ({ node: _, children, ...props }) => {
            return (
              <ul
                className="ml-0 mb-1"
                {...props}
              >
                {children}
              </ul>
            );
          },
          li: ({ node: _, ...props }) => <li className="ml-10 mb-2" {...props} />,
          p({ children, ...props }) {
            return (
              <p className="text-left mb-3" {...props}>
                {children}
              </p>
            );
          },
          img({ src, alt, ...props }) {
            // biome-ignore lint/a11y/useAltText: <explanation>
            return <img src={src} alt={alt} {...props} />;
          },
          a({ href, children, ...props }) {
            // Check if the href is an image link
            const isImageLink = href && imageFileExtensionsRegex.test(href);
            if (isImageLink) {
              return (
                <div>
                  <a href={href} {...props} target={"_blank"} rel="noreferrer">
                    {children}
                  </a>
                  <div className="mt-2">
                    <img
                      src={href}
                      alt={`Image at ${href}`}
                      className="max-w-full h-auto"
                    />
                  </div>
                </div>
              );
            }
            // Default link rendering for non-image links
            return (
              <a
                href={href}
                {...props}
                target={"_blank"}
                rel="noreferrer"
                className="text-primaryaccent hover:text-[#0AAFC8]"
              >
                {children}
              </a>
            );
          },
        }
function MarkdownRenderer({ content, disableMath = false }) {
  // Filter out reference lines like 【4†L24-L30】【4†L32-L35】
  content = content.replace(/【\d+†L\d+-L\d+】/g, '');
  
  // Only process LaTeX if math rendering is enabled
  if (!disableMath) {
    content = content.replace(/\\\[/g, "$$$$\n")
      .replace(/\\\]/g, "\n$$$$")
      .replace(/\\\(/g, "$$")
      .replace(/\\\)/g, "$$")
      .replace(/```latex([\s\S]*?)```/g, "$$$$$1$$$$");
  }

  // Conditionally include math plugins based on disableMath prop
  const remarkPlugins = disableMath ? [remarkGfm] : [remarkGfm, remarkMath];
  const rehypePlugins = disableMath ? [] : [rehypeKatex];

  return (
    <div className="font-inter">
      <ReactMarkdown
        components={components}
        remarkPlugins={remarkPlugins} // Enable GitHub Flavored Markdown, conditionally enable math
        rehypePlugins={rehypePlugins}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

export default MarkdownRenderer; 