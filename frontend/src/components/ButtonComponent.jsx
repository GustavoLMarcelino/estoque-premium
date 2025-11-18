function ButtonComponent({text, type, variant, onClick, disabled}){
  const base = "!rounded-[10px] p-[9px_12px] !text-[14px] max-xl:!text-xs font-semibold cursor-pointer shadow-[0px_1px_2px_rgba(0,0,0,.06)] focus:outline-0"
  const variantStyle = {
    primary: `bg-[var(--g-primary)] text-white hover:bg-[var(--g-primary-h)] ${base} disabled:opacity-[0.6] disabled:cursor-not-allowed`,
    ghost: `bg-[#fff] text-[#374151] !border !border-[var(--g-border)] hover:bg-[#f3f4f6] ${base}`,
    danger: `bg-[var(--g-danger)] text-white hover:brightness-90 ${base}`,
    success: `bg-[#16A34A] text-white hover:brightness-95 w-full ${base}`,
  };

  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`${variantStyle[variant] ? variantStyle[variant] : "bg-[#4285F4] text-white p-[12px_24px] max-xl:p-[8px_12px] !text-base max-xl:!text-xs font-bold border-0 !rounded-[6px] cursor-pointer transition-[background-color_0.3s_ease] !mt-[20px] w-[150px] max-xl:w-[110px] hover:bg-[#3367d6] focus:outline-0"}`}>
      {text}
    </button>
  )
}

export default ButtonComponent