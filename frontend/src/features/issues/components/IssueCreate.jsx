import React, { useState } from "react";
import { Image as ImageIcon } from "lucide-react";

export default function IssueCreate({
  title,
  description,
  selectedType,
  selectedPriority,
  errors,
  setTitle,
  setDescription,
  setSelectedType,
  setSelectedPriority,
  setErrors,
  types,
  priorities,
  getPriorityGradient,
  onCreate,
  onCancel,
}) {
  const [imagePreview, setImagePreview] = useState(null);
  const [imageData, setImageData] = useState(null);

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target.result;
      setImageData(base64);
      setImagePreview(base64);
    };
    reader.readAsDataURL(file);
  };

  const handleCreateWithImage = () => {
    const newErrors = {
      title: !title.trim(),
      description: !description.trim(),
    };
    setErrors(newErrors);

    if (newErrors.title || newErrors.description) return;

    const issuePayload = {
      title,
      description,
      type: selectedType || "-",
      priority: selectedPriority || "-",
      image: imageData || null,
    };

    if (onCreate) {
      onCreate(issuePayload);
    }

    setTitle("");
    setDescription("");
    setSelectedType(null);
    setSelectedPriority(null);
    setErrors({});
    setImagePreview(null);
    setImageData(null);
  };

  return (
    <div className="flex-1 p-8 flex items-center justify-center overflow-auto">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl p-8 animate-fadeIn">
        <div className="flex justify-between items-center mb-8">
          <h2 className="text-3xl font-bold">Nuova Issue</h2>
        </div>

        {/* Titolo */}
        <div className="mb-6">
          <label className="block text-lg font-semibold mb-3">* Titolo:</label>
          <input
            type="text"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setErrors({ ...errors, title: false });
            }}
            className={`w-full bg-gray-100 rounded-xl px-4 py-3 text-gray-600 focus:outline-none transition-all ${
              errors.title
                ? "ring-2 ring-red-500"
                : "focus:ring-2 focus:ring-purple-400"
            }`}
            placeholder="issueProva"
          />
        </div>

        {/* Descrizione */}
        <div className="mb-6">
          <label className="block text-lg font-semibold mb-3">
            * Descrizione:
          </label>
          <textarea
            value={description}
            onChange={(e) => {
              setDescription(e.target.value);
              setErrors({ ...errors, description: false });
            }}
            className={`w-full bg-gray-100 rounded-xl px-4 py-3 text-gray-600 focus:outline-none min-h-32 resize-none transition-all ${
              errors.description
                ? "ring-2 ring-red-500"
                : "focus:ring-2 focus:ring-purple-400"
            }`}
            placeholder="descrizione..."
          />
        </div>

        {/* Tipo */}
        <div className="mb-6">
          <label className="block text-lg font-semibold mb-3">Tipo:</label>
          <div className="flex gap-3 flex-wrap">
            {types.map((type) => (
              <button
                key={type}
                onClick={() =>
                  setSelectedType(selectedType === type ? null : type)
                }
                className={`px-6 py-3 rounded-xl font-semibold transition-all ${
                  selectedType === type
                    ? "bg-gradient-to-r from-purple-400 to-cyan-400 text-white shadow-lg"
                    : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                }`}
              >
                {type}
            </button>
            ))}
          </div>
        </div>

        {/* Priorità */}
        <div className="mb-8">
          <label className="block text-lg font-semibold mb-3">
            Priorità:
          </label>
          <div className="flex gap-3">
            {priorities.map((priority) => (
              <button
                key={priority}
                onClick={() =>
                  setSelectedPriority(
                    selectedPriority === priority ? null : priority
                  )
                }
                className={`px-6 py-3 rounded-xl font-semibold transition-all ${
                  selectedPriority === priority
                    ? `bg-gradient-to-r ${getPriorityGradient(
                        priority
                      )} text-white shadow-lg`
                    : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                }`}
              >
                {priority}
              </button>
            ))}
          </div>
        </div>

        {/* Immagine */}
        <div className="mb-8">
          <label className="block text-lg font-semibold mb-3">
            Immagine:
          </label>
          <div className="flex gap-4 items-start">
            <label className="px-6 py-3 bg-gradient-to-r from-purple-400 to-cyan-400 text-white rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all cursor-pointer">
              <ImageIcon className="inline mr-2" size={20} />
              Carica Immagine
              <input
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
              />
            </label>
            {imagePreview && (
              <div className="relative">
                <img
                  src={imagePreview}
                  alt="Preview"
                  className="h-24 w-24 object-cover rounded-lg shadow-lg"
                />
                <button
                  onClick={() => {
                    setImagePreview(null);
                    setImageData(null);
                  }}
                  className="absolute top-0 right-0 bg-red-500 text-white p-1 hover:bg-red-600 rounded-bl-lg"
                >
                  ✕
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Bottoni azione */}
        <div className="flex gap-4 justify-end">
          <button
            onClick={onCancel}
            className="px-8 py-3 bg-gradient-to-r from-red-400 to-orange-400 text-white rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all"
          >
            Annulla
          </button>
          <button
            onClick={handleCreateWithImage}
            className="px-8 py-3 bg-gradient-to-r from-teal-500 to-green-400 text-white rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all"
          >
            Crea
          </button>
        </div>
      </div>
    </div>
  );
}
