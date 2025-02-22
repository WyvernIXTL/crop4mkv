export function padNumberToString(num: number): string {
    return `${num}`.padStart(2, "0");
}

export function secsToTimeString(secs: number): string {
    const hours = Math.floor(secs / 60 / 60);
    const minutes = Math.floor((secs / 60) % 60);
    const seconds = Math.floor(secs % 60);

    return `${padNumberToString(hours)}:${padNumberToString(
        minutes
    )}:${padNumberToString(seconds)}`;
}
