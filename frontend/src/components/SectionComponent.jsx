function SectionComponent({ title, children }){
    return(
        <section className="bg-[var(--g-card)] border border-[var(--g-border)] rounded-[12px] p-[14px] shadow-[0px_1px_2px_rgba(0,0,0,.03)]">
            <h3 className="!text-[24px] max-xl:!text-lg font-semibold !mb-[10px] text-[var(--g-text)]">{title}</h3>
            {children}
        </section>
    )
}

export default SectionComponent