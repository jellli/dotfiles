local M = {}

---@param scope "declaration" | "definition" | "document_symbol" | "implementation" | "references" | "type_definition" | "workspace_symbol"
function M.lsp_picker(scope)
  M.get_locations(scope, function(items)
    if not items or #items == 0 then
      return
    end

    if #items == 1 then
      local item = items[1]
      vim.lsp.util.show_document(item.result[1], item.offset_encoding, {
        reuse_win = true,
        focus = true,
      })
      vim.cmd("normal! zz")
      return
    end

    MiniPick.start({
      name = "ok",
      source = {
        name = scope,
        items = items,
        show = M.show,
      },
      window = {
        config = {
          width = math.floor(vim.o.columns * 0.65),
        },
      },
    })
  end)
end

---@param scope "declaration" | "definition" | "document_symbol" | "implementation" | "references" | "type_definition" | "workspace_symbol"
function M.get_locations(scope, cb)
  local bufnr = vim.api.nvim_get_current_buf()
  local clients = vim.lsp.get_clients({
    bufnr,
  })

  if #clients == 0 then
    vim.notify("No lsp client")
    return
  end

  local METHOD = "textDocument/" .. scope
  vim.lsp.buf_request_all(bufnr, METHOD, function(client)
    local params = vim.lsp.util.make_position_params(vim.api.nvim_get_current_win(), client.offset_encoding)
    params = vim.tbl_extend("force", params, {
      context = {
        includeDeclaration = false,
      },
    })
    return params
  end, function(results, context, config)
    local items = {}
    for cilent_id, resp in pairs(results) do
      local err, request_result = resp.err, resp.result
      local result = (request_result == nil or vim.tbl_isempty(request_result)) and {}
        or vim.islist(request_result) and request_result
        or { request_result }

      if err then
      elseif #result == 0 then
        -- vim.notify("[" .. cilent_id .. "] " .. "No " .. scope .. " found")
      else
        local client = vim.lsp.get_client_by_id(cilent_id)

        if not client then
          vim.notify("No client found", vim.log.levels.WARN)
          return
        end
        for _, ref in ipairs(vim.lsp.util.locations_to_items(result, client.offset_encoding)) do
          local uri = ref.user_data.uri or ref.user_data.targetUri

          local ft = vim.filetype.match({ filename = ref.filename })
          local has_lang, lang = pcall(vim.treesitter.language.get_lang, ft)

          table.insert(items, {
            text = ref.text,
            lnum = ref.lnum,
            uri = uri,
            ft = ft,
            lang = has_lang and lang or nil,
            col = ref.col,
            path = uri,
            filename = ref.filename,
            offset_encoding = client.offset_encoding,
            result = result,
          })
        end
      end
    end

    cb(items)
  end)
end

M.show = require("picker.utils").createShowFn()

return M
