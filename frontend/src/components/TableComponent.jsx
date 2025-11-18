import { useState } from "react"

function TableComponent({columns = [], data = [], noData}){
    const [sortBy, setSortBy] = useState({key: null, dir: "asc"});
    function toggleSort(key, sortable){
        if(!sortable) return;
        setSortBy((prev) => 
            prev.key !== key ? {key, dir: "asc"}
            : {key, dir: prev.dir === "asc" ? "desc" : "asc"}
        );
    }

    const sortedData = [...data].sort((a, b) => {
        const {key, dir} = sortBy;
        if(!key) return 0;
        const va = a[key];
        const vb = b[key];
        if(typeof va === "number" && typeof vb === "number")
            return dir === "asc" ? va - vb : vb - va;
        return dir === "asc"
            ? String(va).localeCompare(String(vb))
            : String(vb).localeCompare(String(va));
    })

    return(
        <table className="w-full border-collapse">
            <thead>
                <tr>
                    {columns.map((col, i) => (
                        <th key={i} onClick={() => toggleSort(col.key, col.sortable)} title={col.sortable ? "Clique para ordenar" : undefined} className={`p-[12px] text-left !border-b !border-b-[#e5e7eb] bg-[#f3f4f6] text-[#111827] font-bold text-[13px] whitespace-nowrap ${col.sortable ? "cursor-pointer select-none" : ""}`}>
                            {col.label}
                            {sortBy.key === col.key && col.sortable ? sortBy.dir === "asc" ? " 🔼" : " 🔽" : ""}
                        </th>
                    ))}
                </tr>
            </thead>
            <tbody>
                {sortedData.length > 0 ? (
                    sortedData.map((row, i) => (
                        <tr key={i} className="bg-white">
                            {columns.map((col, ci) => (
                                <td key={ci} className="!border-b !border-b-[#e5e7eb] p-[10px] whitespace-nowrap max-xl:text-sm">
                                    {col.render ? col.render(row) : row[col.key]}
                                </td>
                            ))}
                        </tr>
                    ))
                ) : (
                    <tr>
                        <td className="!border-b !border-b-[#e5e7eb] p-[10px] whitespace-nowrap text-center italic text-[#6b7280] max-xl:text-sm" colSpan={columns.length}>{noData}</td>
                    </tr>
                )}
            </tbody>
        </table>
    )
}

export default TableComponent