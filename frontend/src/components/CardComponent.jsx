function CardComponent({icon, title, value }) {
    return(
        <>
            <div className="flex flex-col items-center border-1 border-[rgba(0,0,0,0.175)] p-[20px] max-sm:p-[10px] bg-white rounded-md shadow-[0_2px_8px_rgba(0,0,0,0.08)] transition-transform duration-200 ease-in-out hover:-translate-y-0.5">
                <div className="text-[40px] max-lg:text-[25px]">{icon}</div>
                <div className="text-center">
                    <h3 className="m-0 !text-base max-xl:!text-sm !text-[#333]">{title}</h3>
                    <p className="mt-1 mb-0 text-lg max-xl:text-base font-bold text-[#111]"><strong>{value}</strong></p>
                </div>
            </div>
        </>
    )
}

export default CardComponent