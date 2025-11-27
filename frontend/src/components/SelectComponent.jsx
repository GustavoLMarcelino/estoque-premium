function SelectComponent({idName, value, onChange, required, disabled, children}){
    return(
        <select name={idName} id={idName} value={value} onChange={onChange} required={required} disabled={disabled} className="w-full !p-[8px] font-normal !text-base max-xl:!text-xs border !border-[#cccccc] rounded-[5px] bg-white text-black box-border placeholder:text-[#999999]">
            {children}
        </select>
    )
}

export default SelectComponent