// ==================== API Connection Models Probe ====================
async function runApiModelsEndpointTest(modelsUrl, apiKey, tested) {
    tested.push('GET ' + modelsUrl);
    var headers = {};
    if (apiKey) headers.Authorization = 'Bearer ' + apiKey;
    var resp = await fetchApiTestWithTimeout(modelsUrl, { method: 'GET', headers: headers });

    if (resp.ok) {
        var data = await resp.json().catch(function() { return {}; });
        return {
            ok: true,
            html: buildApiTestSuccessHtml(collectApiTestModelNames(data))
        };
    }

    return {
        ok: false,
        error: await readApiTestHttpError(resp)
    };
}
