local M = {}

---@param scope "declaration" | "definition" | "document_symbol" | "implementation" | "references" | "type_definition" | "workspace_symbol"
function M.lsp_picker(scope)
  M.get_locations(scope, function(items)
    if not items then
      return
    end
    MiniPick.start({
      name = "ok",
      source = {
        name = scope,
        items = items,
        show = M.show,
      },
    })
  end)
end

---@param scope "declaration" | "definition" | "document_symbol" | "implementation" | "references" | "type_definition" | "workspace_symbol"
function M.get_locations(scope, cb)
  local bufnr = vim.api.nvim_get_current_buf()
  local client = vim.lsp.get_clients({
    bufnr,
  })[1]

  if not client then
    vim.notify("No lsp client")
    return
  end
  local params = vim.lsp.util.make_position_params(vim.api.nvim_get_current_win(), client.offset_encoding)
  params = vim.tbl_extend("force", params, {
    context = {
      -- includeDeclaration = true,
    },
  })

  local method = "textDocument/" .. scope
  if not client:supports_method(method) then
    vim.notify(string.format("client %s don not support %s", client.name, method))
  end
  local result = {}
  client:request(method, params, function(err, request_result, context, config)
    if not request_result or err then
      vim.notify("No " .. scope .. " found")
      return
    end

    if #request_result == 1 then
      vim.lsp.util.show_document(request_result[1], client.offset_encoding, {
        reuse_win = true,
        focus = true,
      })
      vim.cmd("normal! zz")
      return
    end

    for _, ref in ipairs(vim.lsp.util.locations_to_items(request_result, client.offset_encoding)) do
      local uri = ref.user_data.uri or ref.user_data.targetUri
      -- local range = ref.user_data.range or ref.user_data.targetRange

      local ft = vim.filetype.match({ filename = ref.filename })
      local has_lang, lang = pcall(vim.treesitter.language.get_lang, ft)

      table.insert(result, {
        text = ref.text,
        lnum = ref.lnum,
        uri = uri,
        ft = ft,
        lang = has_lang and lang or nil,
        col = ref.col,
        path = uri,
        filename = ref.filename,
      })
    end
    cb(result)
  end, bufnr)
end

M.show = require("picker.utils").createShowFn()

return M
