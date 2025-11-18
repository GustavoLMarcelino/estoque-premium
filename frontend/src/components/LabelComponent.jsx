function LabelComponent({htmlFor, text}){
    return(
        <label className="mb-[5px] !text-[#222222] max-xl:text-xs" htmlFor={htmlFor}>{text}</label>
    )
}

export default LabelComponent