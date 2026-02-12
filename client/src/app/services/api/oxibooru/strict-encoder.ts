import { HttpUrlEncodingCodec } from "@angular/common/http";

export class StrictEncoder extends HttpUrlEncodingCodec {
    override encodeValue(value: string): string {
        return encodeURIComponent(value);
    }
}