function InputComponent({idName, type, step, value, onChange, placeholder, min, max, disabled, checked, multiple, accept}){
    return(
        <input className={`${type == "checkbox" ? "w-auto" : "w-full !p-[8px] font-normal !text-base max-xl:!text-xs border !border-[#cccccc] rounded-[5px] bg-white text-black box-border placeholder:text-[#999999]"}`}
              id={idName}
              type={type}
              step={step}
              min={min}
              max={max}
              name={idName}
              value={value}
              onChange={onChange}
              placeholder={placeholder}
              required
              disabled={disabled}
              checked={checked}
              multiple={multiple}
              accept={accept}
        />
    )
}

export default InputComponent