fn main(
    order_id: Field, asset_id: u32, request_salt: Field, response_asset_id: u32,
    observed_at: u64, sample_count: u32, confidence_bps: u16,
    price_micros: u64, response_salt: Field,
) -> pub [Field; 2] {
    let request = schema::request_commitment(asset_id, request_salt);
    [request, schema::response_commitment(
        order_id, request, response_asset_id, observed_at,
        sample_count, confidence_bps, price_micros, response_salt,
    )]
}
