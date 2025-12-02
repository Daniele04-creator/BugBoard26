import React, { useEffect, useState } from "react";
import { ChevronUp, ChevronDown } from "lucide-react";

// 👇 Base URL del backend (Azure o localhost)
const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  "http://localhost:8080";

export default function IssueList({ onSelectIssue }) {
  const [issues, setIssues] = useState([]);
  const [loading, setLoading] = useState(true);

  // FILTRI
  const [filterType, setFilterType] = useState("Tutti");
  const [filterStatus, setFilterStatus] = useState("Tutti");
  const [filterPriority, setFilterPriority] = useState("Tutti");
  const [searchTitle, setSearchTitle] = useState("");

  // ORDINAMENTO
  const [sortBy, setSortBy] = useState("Data");
  const [sortOrder, setSortOrder] = useState("desc");

  // 1️⃣ CARICO LE ISSUE DAL BACKEND
  useEffect(() => {
    const loadIssues = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/issues`);

        if (!response.ok) {
          console.error("Errore HTTP caricamento issue:", response.status);
          return;
        }

        const data = await response.json();
        setIssues(data);
      } catch (error) {
        console.error("Errore caricamento issue:", error);
      } finally {
        setLoading(false);
      }
    };

    loadIssues();
  }, []);

  // 2️⃣ FILTRI LOCALI
  const filtered = issues.filter((issue) => {
    const matchType = filterType === "Tutti" || issue.type === filterType;
    const matchStatus = filterStatus === "Tutti" || issue.status === filterStatus;
    const matchPriority = filterPriority === "Tutti" || issue.priority === filterPriority;
    const matchTitle = issue.title
      ?.toLowerCase()
      .includes(searchTitle.toLowerCase());

    return matchType && matchStatus && matchPriority && matchTitle;
  });

  // 3️⃣ ORDINAMENTO LOCATE
  const sorted = [...filtered].sort((a, b) => {
    let result = 0;

    switch (sortBy) {
      case "Data": {
        const da = new Date(a.createdAt || 0);
        const db = new Date(b.createdAt || 0);
        result = db - da;
        break;
      }

      case "Titolo":
        result = a.title.localeCompare(b.title);
        break;

      case "Priorità": {
        const order = { Alta: 3, Media: 2, Bassa: 1 };
        result = (order[b.priority] || 0) - (order[a.priority] || 0);
        break;
      }

      case "Stato": {
        const order = { TODO: 1, DOING: 2, DONE: 3 };
        result = (order[a.status] || 0) - (order[b.status] || 0);
        break;
      }

      default:
        result = 0;
    }

    return sortOrder === "asc" ? -result : result;
  });

  const handleResetFilters = () => {
    setFilterType("Tutti");
    setFilterStatus("Tutti");
    setFilterPriority("Tutti");
    setSearchTitle("");
    setSortBy("Data");
    setSortOrder("desc");
  };

  //if (loading) return <div className="p-10 text-xl">Caricamento...</div>;

  return (
    <div className="flex-1 p-8 flex items-center justify-center overflow-auto">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-6xl p-8 animate-fadeIn">

        <h2 className="text-3xl font-bold mb-8">Elenco Issue</h2>

        {/* FILTRI */}
        <div className="mb-6 flex items-center gap-4 flex-wrap">
          <span className="text-lg font-semibold italic">Filtri:</span>

          {/* Tipo */}
          <div className="flex items-center gap-2 ml-[50px]">
            <span className="text-sm font-medium ">Tipo:</span>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="bg-gray-200 px-3 py-2 rounded-lg text-sm focus:outline-none"
            >
              <option>Tutti</option>
              <option>Question</option>
              <option>Bug</option>
              <option>Documentation</option>
              <option>Feature</option>
            </select>
          </div>

          {/* Stato */}
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Stato:</span>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="bg-gray-200 px-3 py-2 rounded-lg text-sm focus:outline-none"
            >
              <option>Tutti</option>
              <option>TODO</option>
              <option>DOING</option>
              <option>DONE</option>
            </select>
          </div>

          {/* Priorità */}
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Priorità:</span>
            <select
              value={filterPriority}
              onChange={(e) => setFilterPriority(e.target.value)}
              className="bg-gray-200 px-3 py-2 rounded-lg text-sm focus:outline-none"
            >
              <option>Tutti</option>
              <option>Bassa</option>
              <option>Media</option>
              <option>Alta</option>
            </select>
          </div>

          {/* Titolo */}
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Titolo:</span>
            <input
              type="text"
              value={searchTitle}
              onChange={(e) => setSearchTitle(e.target.value)}
              placeholder="Scrivi qui..."
              className="bg-gray-200 px-3 py-2 rounded-lg text-sm focus:outline-none"
            />
          </div>

          <button
            onClick={handleResetFilters}
            className="ml-auto px-4 py-2 bg-gradient-to-r from-purple-400 to-cyan-400 text-white rounded-2xl font-semibold shadow-lg hover:shadow-xl transition-all"
            title="Reimposta tutti i filtri"
          >
            Reset Filtri
          </button>
        </div>

        {/* ORDINAMENTO */}
        <div className="mb-6 flex items-center gap-4">
          <span className="text-lg font-semibold italic">Ordina per:</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="bg-gray-200 px-3 py-2 rounded-lg text-sm focus:outline-none ml-10"
          >
            <option>Data</option>
            <option>Titolo</option>
            <option>Priorità</option>
            <option>Stato</option>
          </select>
          <button
            onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
            className="p-2 bg-gray-200 hover:bg-gray-300 rounded-lg transition-all"
            title={sortOrder === "asc" ? "Ordine ascendente" : "Ordine discendente"}
          >
            {sortOrder === "asc" ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
          </button>
        </div>

        {/* TABELLONE */}
        <div className="bg-gray-100 rounded-2xl p-6 min-h-96">
          <table className="w-full text-left">
            <thead>
              <tr className="text-gray-500 italic border-b border-gray-300">
                <th className="pb-3 font-medium">Titolo</th>
                <th className="pb-3 font-medium">Tipo</th>
                <th className="pb-3 font-medium">Priorità</th>
                <th className="pb-3 font-medium">Stato</th>
                <th className="pb-3 font-medium">Assegnatario</th>
                <th className="pb-3 font-medium">Data</th>
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 && (
                <tr>
                  <td colSpan="6" className="py-6 text-center text-gray-500">
                    Nessuna issue trovata.
                  </td>
                </tr>
              )}

              {sorted.map((issue) => (
                <tr 
                  key={issue.id} 
                  onDoubleClick={() => onSelectIssue && onSelectIssue(issue)}
                  className="text-gray-600 border-b border-gray-300 cursor-pointer hover:bg-gray-50 transition-colors"
                >
                  <td className="py-3">{issue.title}</td>
                  <td className="py-3">{issue.type}</td>
                  <td className="py-3">{issue.priority}</td>
                  <td className="py-3">{issue.status}</td>
                  <td className="py-3">{issue.assignee}</td>
                  <td className="py-3">
                    {issue.createdAt
                      ? issue.createdAt.replace("T", " ").split(".")[0]
                      : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

      </div>
    </div>
  );
}
