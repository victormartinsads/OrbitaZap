export const onlyDigits = (value: string) => value.replace(/\D/g, "");

function isValidCpf(cpf: string) {
    if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false;
    const digit = (len: number) => {
        let sum = 0;
        for (let i = 0; i < len; i++) sum += Number(cpf[i]) * (len + 1 - i);
        const rest = (sum * 10) % 11;
        return rest === 10 ? 0 : rest;
    };
    return digit(9) === Number(cpf[9]) && digit(10) === Number(cpf[10]);
}

function isValidCnpj(cnpj: string) {
    if (cnpj.length !== 14 || /^(\d)\1+$/.test(cnpj)) return false;
    const digit = (len: number) => {
        const weights = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
        const sum = weights.reduce((acc, w, i) => acc + Number(cnpj[i]) * w, 0);
        const rest = sum % 11;
        return rest < 2 ? 0 : 11 - rest;
    };
    return digit(12) === Number(cnpj[12]) && digit(13) === Number(cnpj[13]);
}

export function isValidCpfCnpj(value: string) {
    const digits = onlyDigits(value);
    return digits.length === 11 ? isValidCpf(digits) : isValidCnpj(digits);
}
