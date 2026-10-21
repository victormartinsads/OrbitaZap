import Image from "next/image";

export const BRAND_TAGLINE = "Automação WhatsApp";

export function MarcFlowLogo({ className = "h-10 w-10" }: { className?: string }) {
    return (
        <div className={`relative overflow-hidden rounded-full shrink-0 ${className}`}>
            <Image
                src="/logo.png"
                alt="Logo"
                width={80}
                height={80}
                className="w-full h-full object-cover"
                priority
            />
        </div>
    );
}
