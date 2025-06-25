import { ArrowUp, Loader2 } from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import TextAreaAutosize from "react-textarea-autosize";

function ChatInput({
	onSendMessage,
	loading = false,
	visionSupported = false,
	models = [],
	selectedModel = "",
	onModelChange,
}) {
	const [message, setMessage] = useState("");
	const [images, setImages] = useState([]); // State for selected images
	const textareaRef = useRef(null);
	const fileInputRef = useRef(null); // Ref for file input
	const prevLoadingRef = useRef(loading);

	// Function to handle image selection
	const handleImageChange = (e) => {
		const files = Array.from(e.target.files);
		const remainingSlots = 5 - images.length;

		if (files.length > remainingSlots) {
			alert(
				`You can only add ${remainingSlots > 0 ? remainingSlots : "no more"} images (max 5).`,
			);
			// Optionally, only take the allowed number of files
			// files = files.slice(0, remainingSlots);
		}

		const imagePromises = files.slice(0, remainingSlots).map((file) => {
			return new Promise((resolve, reject) => {
				// Basic validation (optional: check file type, size)
				if (!file.type.startsWith("image/")) {
					console.warn(`Skipping non-image file: ${file.name}`);
					return resolve(null); // Resolve with null to filter out later
				}

				const reader = new FileReader();
				reader.onloadend = () => {
					// Store base64 string and file name/type for display
					resolve({
						base64: reader.result, // Includes data:image/jpeg;base64,... prefix
						name: file.name,
						type: file.type,
					});
				};
				reader.onerror = reject;
				reader.readAsDataURL(file);
			});
		});

		Promise.all(imagePromises)
			.then((newImages) => {
				const validImages = newImages.filter((img) => img !== null);
				setImages((prev) => [...prev, ...validImages]);
				// Reset file input value to allow selecting the same file again
				if (fileInputRef.current) fileInputRef.current.value = "";
			})
			.catch((error) => {
				console.error("Error reading image files:", error);
				alert("Error processing images.");
				if (fileInputRef.current) fileInputRef.current.value = "";
			});
	};

	// Function to remove an image
	const removeImage = (index) => {
		setImages((prev) => prev.filter((_, i) => i !== index));
	};

	useEffect(() => {
		if (textareaRef.current) {
			textareaRef.current.style.height = "auto";
			textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
		}
	}, [message]);

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

	const handleSubmit = (e) => {
		e.preventDefault();
		const textContent = message.trim();
		const hasText = textContent.length > 0;
		const hasImages = images.length > 0;

		if ((hasText || hasImages) && !loading) {
			let contentToSend;
			if (hasImages) {
				// Format content as array with text and image parts
				contentToSend = [
					// Add text part only if there is text
					...(hasText ? [{ type: "text", text: textContent }] : []),
					// Add image parts
					...images.map((img) => ({
						type: "image_url",
						image_url: { url: img.base64 }, // Send base64 data URL
					})),
				];
			} else {
				// If no images, send only the text string
				contentToSend = [{ type: "text", text: textContent }]; // Send as array even for text only
			}

			onSendMessage(contentToSend);
			setMessage("");
			setImages([]); // Clear images after sending
		}
	};

	const handleKeyDown = (e) => {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			handleSubmit(e);
		}
	};

	return (
    <div className="flex flex-col gap-2 border border-gray/200 rounded-lg shadow-md w-full p-3">
		<form onSubmit={handleSubmit} className="flex flex-col gap-2">
			{/* Image Previews Area */}
			{images.length > 0 && (
				<div className="flex flex-col gap-2 mb-2">
					<p className="text-sm font-medium text-gray-400">
						Attached Images ({images.length}):
					</p>
					<div className="flex flex-wrap gap-2 p-2 border border-gray-600 rounded-md">
						{images.map((img, index) => (
							<div key={index} className="relative group w-16 h-16">
								<img
									src={img.base64}
									alt={`Preview ${index + 1}`}
									className="w-full h-full object-cover rounded-md cursor-pointer"
								/>
								<button
									type="button"
									onClick={() => removeImage(index)}
									className="absolute top-0 right-0 bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
									aria-label={`Remove image ${index + 1}`}
								>
									✕
								</button>
							</div>
						))}
					</div>
				</div>
			)}

			<div className="flex flex-col gap-2">
				{/* Input Area with Submit Button */}
				<div className="flex items-center gap-2">
					<TextAreaAutosize
						ref={textareaRef}
						value={message}
						onChange={(e) => setMessage(e.target.value)}
						onKeyDown={handleKeyDown}
						placeholder="Ask Groq"
						className="w-full px-4 py-3 bg-white resize-none border-none rounded-lg text-black placeholder-gray-600 focus:outline-none"
						rows={1}
						disabled={loading}
					/>
					<button
						type="submit"
						className="p-3 bg-[#f55036] text-white rounded-full disabled:opacity-50 disabled:cursor-not-allowed"
						disabled={loading || (!message.trim() && images.length === 0)}
					>
						{loading ? (
							<Loader2 className="w-4 h-4 animate-spin" />
						) : (
							<ArrowUp className="w-4 h-4" aria-hidden="true" />
						)}
					</button>
				</div>

				{/* Bottom Controls */}
				<div className="flex items-center justify-between px-1">
					{/* Image Upload Button */}
					{visionSupported && images.length < 5 && (
						<button
							type="button"
							onClick={() => fileInputRef.current?.click()}
							className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
							title="Add Image (max 5)"
							disabled={loading}
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								width="20"
								height="20"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2"
								strokeLinecap="round"
								strokeLinejoin="round"
							>
								<path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path>
							</svg>
						</button>
					)}
					<input
						type="file"
						ref={fileInputRef}
						onChange={handleImageChange}
						accept="image/*"
						multiple
						style={{ display: "none" }}
						disabled={loading || images.length >= 5}
					/>

					{/* Model Selector */}
					<select
						value={selectedModel}
						onChange={(e) => onModelChange(e.target.value)}
						className="bg-transparent text-black text-sm border-none focus:ring-0 cursor-pointer hover:cursor-pointer transition-colors"
					>
						{models.map(model => (
							<option key={model} value={model}>{model}</option>
						))}
					</select>
				</div>
			</div>
		</form>
    </div>
	);
}

export default ChatInput;
