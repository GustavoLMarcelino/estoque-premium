function ErrorMsg({errorMsg}){
    return(
        <div className="p-[10px] mb-[10px] bg-[#ffebee] w-full border border-[#e53935] text-[#b71c1c] rounded-[8px] !text-base max-xl:!text-xs">
          {errorMsg}
        </div>
    )
}

export default ErrorMsg