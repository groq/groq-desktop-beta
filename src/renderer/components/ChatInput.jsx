import { ArrowUp, Loader2, ImagePlus, Hammer, Upload, Zap, ZapOff } from "lucide-react";
import React, { useContext, useEffect, useRef, useState } from "react";
import TextAreaAutosize from "react-textarea-autosize";
import { 
	Select, 
	SelectContent, 
	SelectItem, 
	SelectTrigger, 
	SelectValue 
} from "./ui/select";
import { Button } from "./ui/button";
import { cn } from "../lib/utils";
import { ChatContext } from "../context/ChatContext";

function ChatInput({
	onSendMessage,
	loading = false,
	visionSupported = false,
	models = [],
	selectedModel = "",
	onModelChange,
	onOpenMcpTools,
	modelConfigs = {},
}) {
	const [message, setMessage] = useState("");
	const [suggestion, setSuggestion] = useState("");
	const [autocompleteEnabled, setAutocompleteEnabled] = useState(true);
	const suggestionTimeout = useRef(null);
	const { messages, activeContext } = useContext(ChatContext);

	const [files, setFiles] = useState([]); // Changed from images to files to handle all file types
	const [textareaHeight, setTextareaHeight] = useState(null);
	const [rowHeight, setRowHeight] = useState(null);

	// Helper function to get display name for a model
	const getModelDisplayName = (modelId) => {
		const modelInfo = modelConfigs[modelId];
		if (modelInfo && modelInfo.displayName) {
			return modelInfo.displayName;
		}
		
		// If no explicit displayName is configured, return the raw modelId without auto-capitalization
		return modelId;
	};
	const [isDragOver, setIsDragOver] = useState(false);
	const [fullScreenImage, setFullScreenImage] = useState(null);
	const textareaRef = useRef(null);
	const fileInputRef = useRef(null); // Ref for file input
	const prevLoadingRef = useRef(loading);
	

	// Function to handle file selection (images and other files)
	const handleFileChange = (e) => {
		const selectedFiles = Array.from(e.target.files);
		const remainingSlots = 5 - files.length;

		// Check if any images are being uploaded with a non-vision model
		const hasImages = selectedFiles.some(file => file.type.startsWith("image/"));
		if (hasImages && !visionSupported) {
			alert("The selected model does not support image inputs. Please select a vision-capable model or upload text files only.");
			if (fileInputRef.current) fileInputRef.current.value = "";
			return;
		}

		if (selectedFiles.length > remainingSlots) {
			alert(
				`You can only add ${remainingSlots > 0 ? remainingSlots : "no more"} files (max 5).`,
			);
		}

		const filePromises = selectedFiles.slice(0, remainingSlots).map((file) => {
			return new Promise((resolve, reject) => {
				// Handle different file types
				if (file.type.startsWith("image/")) {
					// For images, create base64 preview
					const reader = new FileReader();
					reader.onloadend = () => {
						resolve({
							base64: reader.result,
							name: file.name,
							type: file.type,
							size: file.size,
							fileType: 'image',
						});
					};
					reader.onerror = reject;
					reader.readAsDataURL(file);
				} else {
					// For other files, just store file info without base64
					resolve({
						name: file.name,
						type: file.type,
						size: file.size,
						fileType: 'document',
						file: file, // Store the actual file for later processing
					});
				}
			});
		});

		Promise.all(filePromises)
			.then((newFiles) => {
				const validFiles = newFiles.filter((file) => file !== null);
				setFiles((prev) => [...prev, ...validFiles]);
				// Reset file input value to allow selecting the same file again
				if (fileInputRef.current) fileInputRef.current.value = "";
			})
			.catch((error) => {
				console.error("Error reading files:", error);
				alert("Error processing files.");
				if (fileInputRef.current) fileInputRef.current.value = "";
			});
	};

	// Function to remove a file
	const removeFile = (index) => {
		setFiles((prev) => prev.filter((_, i) => i !== index));
	};

	// Function to format file size
	const formatFileSize = (bytes) => {
		if (bytes === 0) return '0 Bytes';
		const k = 1024;
		const sizes = ['Bytes', 'KB', 'MB', 'GB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
	};

	// Drag and drop handlers
	const handleDragOver = (e) => {
		e.preventDefault();
		e.stopPropagation();
		setIsDragOver(true);
	};

	const handleDragLeave = (e) => {
		e.preventDefault();
		e.stopPropagation();
		// Only set dragOver to false if we're leaving the entire input area
		if (!e.currentTarget.contains(e.relatedTarget)) {
			setIsDragOver(false);
		}
	};

	const handleDrop = (e) => {
		e.preventDefault();
		e.stopPropagation();
		setIsDragOver(false);
		
		const droppedFiles = Array.from(e.dataTransfer.files);
		if (droppedFiles.length > 0) {
			// Use the existing handleFileChange logic by creating a fake event
			const fakeEvent = {
				target: {
					files: droppedFiles
				}
			};
			handleFileChange(fakeEvent);
		}
	};



	// Focus the textarea after component mounts
	useEffect(() => {
		if (textareaRef.current) {
			textareaRef.current.focus();
		}
	}, []);

	// Focus the textarea when loading changes from true to false (completion finished)
	useEffect(() => {
		// Check if loading just changed from true to false
		if (prevLoadingRef.current && !loading) {
			if (textareaRef.current) {
				textareaRef.current.focus();
			}
		}
		// Update the ref with current loading state
		prevLoadingRef.current = loading;
	}, [loading]);

	// Handle Escape key for closing fullscreen image
	useEffect(() => {
		const handleKeyDown = (event) => {
			if (event.key === 'Escape' && fullScreenImage) {
				setFullScreenImage(null);
			}
		};

		if (fullScreenImage) {
			document.addEventListener('keydown', handleKeyDown);
		}

		return () => {
			document.removeEventListener('keydown', handleKeyDown);
		};
	}, [fullScreenImage]);

	const handleSubmit = (e) => {
		e.preventDefault();
		const textContent = message.trim();
		const hasText = textContent.length > 0;
		const hasFiles = files.length > 0;

		if ((hasText || hasFiles) && !loading) {
			let contentToSend;
			if (hasFiles) {
				// Format content as array with text and file parts
				const contentParts = [];
				
				// Add text part only if there is text
				if (hasText) {
					contentParts.push({ type: "text", text: textContent });
				}
				
				// Add file parts
				files.forEach((file) => {
					if (file.fileType === 'image' && file.base64) {
						// For images, send as image_url
						contentParts.push({
							type: "image_url",
							image_url: { url: file.base64 },
						});
					} else {
						// For other files, send as text description (since most models can't process files directly)
						contentParts.push({
							type: "text",
							text: `[File: ${file.name} (${file.type}, ${formatFileSize(file.size)})]`,
						});
					}
				});
				
				contentToSend = contentParts;
			} else {
				// If no files, send only the text string
				contentToSend = [{ type: "text", text: textContent }];
			}

			onSendMessage(contentToSend);
			setMessage("");
			setFiles([]); // Clear files after sending
			setSuggestion(""); // Clear suggestion on send
		}
	};

	const handleKeyDown = (e) => {
		// Accept suggestion on Tab (only if autocomplete is enabled)
		if (e.key === "Tab" && autocompleteEnabled && suggestion) {
			e.preventDefault();
			setMessage(message + suggestion);
			setSuggestion("");
			return; // Prevent other key handlers from firing
		}

		// Clear suggestion on escape
		if (e.key === "Escape" && suggestion) {
			e.preventDefault();
			setSuggestion("");
			return;
		}

		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			handleSubmit(e);
		}
	};

	// Handle paste events to ensure textarea resizes properly
	const handlePaste = (e) => {
		// Don't prevent default - let the paste happen naturally
		// Just ensure the textarea resizes properly after paste
		setTimeout(() => {
			// Force a resize check after paste completes
			if (textareaRef.current && textareaRef.current._resizeComponent) {
				textareaRef.current._resizeComponent();
			}
		}, 0);
	};

	// Handle height changes to track when resizing occurs
	const handleHeightChange = (height, info) => {
		// Track the current height and row height
		setTextareaHeight(height);
		if (info && info.rowHeight) {
			setRowHeight(info.rowHeight);
		}
	};

	// Calculate if we're at max height (10 rows + padding)
	// Account for padding (py-3 = 0.75rem * 2 = 1.5rem = 24px at default font size)
	const maxHeightThreshold = rowHeight ? (rowHeight * 10) + 24 : null;
	const isAtMaxHeight = textareaHeight && maxHeightThreshold && textareaHeight >= maxHeightThreshold;

	return (
    <div 
			className={cn(
				"flex flex-col gap-4 border rounded-2xl shadow-lg w-full p-4 bg-card/50 backdrop-blur-sm transition-all duration-200",
				isDragOver 
					? "border-primary border-2 bg-primary/5 shadow-xl" 
					: "border-border/50"
			)}
			onDragOver={handleDragOver}
			onDragLeave={handleDragLeave}
			onDrop={handleDrop}
		>
		<form onSubmit={handleSubmit} className="flex flex-col gap-4">
			{/* File Previews Area */}
			{files.length > 0 && (
				<div className="flex flex-col gap-3">
					<p className="text-sm font-medium text-muted-foreground">
						Attached Files ({files.length}):
					</p>
					<div className="flex flex-wrap gap-3 p-3 border border-border/30 rounded-xl bg-muted/20">
						{files.map((file, index) => (
							<div key={index} className="relative group">
								{file.fileType === 'image' ? (
									// Image preview
									<div className="w-20 h-20">
										<img
											src={file.base64}
											alt={`Preview ${index + 1}`}
											className="w-full h-full object-cover rounded-lg cursor-pointer shadow-sm hover:opacity-80 transition-opacity"
											onClick={() => setFullScreenImage(file.base64)}
										/>
										<button
											type="button"
											onClick={() => removeFile(index)}
											className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full w-6 h-6 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-all duration-200 shadow-md hover:scale-110"
											aria-label={`Remove file ${index + 1}`}
										>
											✕
										</button>
									</div>
								) : (
									// Document preview
									<div className="flex items-center gap-2 bg-background/80 rounded-lg p-3 border border-border/50 min-w-[200px]">
										<div className="w-8 h-8 bg-primary/10 rounded flex items-center justify-center">
											<Upload className="w-4 h-4 text-primary" />
										</div>
										<div className="flex-1 min-w-0">
											<p className="text-sm font-medium text-foreground truncate">{file.name}</p>
											<p className="text-xs text-muted-foreground">{formatFileSize(file.size)}</p>
										</div>
										<button
											type="button"
											onClick={() => removeFile(index)}
											className="text-muted-foreground hover:text-destructive transition-colors"
											aria-label={`Remove file ${index + 1}`}
										>
											✕
										</button>
									</div>
								)}
							</div>
						))}
					</div>
				</div>
			)}

			<div className="flex flex-col gap-3">
				{/* Input Area with Submit Button */}
				<div className="flex items-center gap-3">
					<div className="flex-1 relative">
						<TextAreaAutosize
							ref={textareaRef}
							value={message}
							onChange={(e) => setMessage(e.target.value)}
							onKeyDown={handleKeyDown}
							onPaste={handlePaste}
							onHeightChange={handleHeightChange}
							placeholder={isDragOver ? "Drop files here..." : "Ask Groq anything..."}
							className={cn(
								"w-full px-4 py-3 bg-background/80 backdrop-blur-sm resize-none border rounded-2xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-ring/50 transition-all duration-200",
								isDragOver 
									? "border-primary/50 bg-primary/5" 
									: "border-border/50",
								// Control overflow based on whether we're at max height
								isAtMaxHeight ? "overflow-y-auto" : "overflow-y-hidden"
							)}
							style={{
								// Ensure smooth scrollbar appearance
								scrollbarWidth: 'thin',
								scrollbarGutter: 'stable'
							}}
							minRows={1}
							maxRows={10}
							cacheMeasurements={true}
							disabled={loading}
						/>
						{/* Drag overlay */}
						{isDragOver && (
							<div className="absolute inset-0 bg-primary/10 border-2 border-dashed border-primary rounded-2xl flex items-center justify-center pointer-events-none">
								<div className="text-primary font-medium flex items-center gap-2">
									<ImagePlus className="w-5 h-5" />
									Drop files here
								</div>
							</div>
						)}
					</div>
					<div className="self-start">
						<Button
							type="submit"
							size="icon"
							className="h-12 w-12 rounded-2xl bg-primary hover:bg-primary/90 shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-105"
							disabled={loading || (!message.trim() && files.length === 0)}
						>
							{loading ? (
								<Loader2 className="w-5 h-5 animate-spin" />
							) : (
								<ArrowUp className="w-5 h-5" aria-hidden="true" />
							)}
						</Button>
					</div>
				</div>

				{/* Bottom Controls */}
				<div className="flex items-center justify-between px-2">
					<div className="flex items-center gap-2">
						{/* File Upload Button */}
						{files.length < 5 && (
							<Button
								type="button"
								variant="ghost"
								size="sm"
								onClick={() => fileInputRef.current?.click()}
								className="text-muted-foreground hover:text-foreground transition-colors rounded-xl"
								title={visionSupported ? "Upload file or image (max 5)" : "Upload files (images require vision-capable model)"}
								disabled={loading}
							>
								<ImagePlus className="w-4 h-4 mr-2" />
								Upload
							</Button>
						)}
						<input
							type="file"
							ref={fileInputRef}
							onChange={handleFileChange}
							accept={visionSupported ? "*/*" : ".txt,.md,.json,.csv,.xml,.html,.css,.js,.ts,.py,.java,.cpp,.c,.h,.log,.sql"}
							multiple
							style={{ display: "none" }}
							disabled={loading || files.length >= 5}
						/>

						{/* MCP Tools Button */}
						{onOpenMcpTools && (
							<Button
								type="button"
								variant="ghost"
								size="sm"
								onClick={onOpenMcpTools}
								className="text-muted-foreground hover:text-foreground transition-colors rounded-xl"
								title="Open MCP tools panel"
								disabled={loading}
							>
								<Hammer className="w-4 h-4 mr-2" />
								Tools
							</Button>
						)}
					</div>

					<div className="flex items-center gap-3">
						{/* Autocomplete hint */}
						{autocompleteEnabled && suggestion && !loading && (
							<div className="text-xs text-muted-foreground flex items-center gap-1">
								<kbd className="px-1.5 py-0.5 text-xs bg-muted border rounded">Tab</kbd>
								to accept
							</div>
						)}
						
						{/* Model Selector */}
						<Select value={selectedModel} onValueChange={onModelChange}>
							<SelectTrigger className="w-48 h-8 rounded-xl border-border/50 bg-background/50 text-sm text-foreground">
								<SelectValue placeholder="Select model" className="text-foreground">
									{selectedModel ? getModelDisplayName(selectedModel) : "Select model"}
								</SelectValue>
							</SelectTrigger>
							<SelectContent className="rounded-xl">
								{models.map(model => (
									<SelectItem key={model} value={model} className="rounded-lg text-foreground">
										{getModelDisplayName(model)}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
				</div>
			</div>
		</form>

		{/* Fullscreen Image Modal */}
		{fullScreenImage && (
			<div 
				className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50 p-4 cursor-pointer"
				onClick={() => setFullScreenImage(null)}
			>
				<img 
					src={fullScreenImage} 
					alt="Fullscreen preview" 
					className="max-w-full max-h-full object-contain"
					onClick={(e) => e.stopPropagation()}
				/>
				<button
					onClick={() => setFullScreenImage(null)}
					className="absolute top-4 right-4 bg-black bg-opacity-50 text-white rounded-full w-10 h-10 flex items-center justify-center hover:bg-opacity-70 transition-all"
					aria-label="Close fullscreen image"
				>
					✕
				</button>
			</div>
		)}
    </div>
	);
}

export default ChatInput;
