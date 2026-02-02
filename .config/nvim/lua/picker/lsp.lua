local M = {}

---@alias LspRequestType
---| "declaration"
---| "definition"
---| "document_symbol"
---| "implementation"
---| "references"
---| "type_definition"
---| "workspace_symbol"

---@param scope LspRequestType
function M.lsp_picker(scope)
  M.get_locations(scope, function(items)
    if not items or #items == 0 then
      vim.notify("No locations found", vim.log.levels.WARN)
      return
    end

    if #items == 1 then
      local item = items[1]
      vim.lsp.util.show_document(item.user_data, item.offset_encoding, {
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

---@param scope LspRequestType
function M.get_locations(scope, cb)
  local bufnr = vim.api.nvim_get_current_buf()
  local win = vim.api.nvim_get_current_win()

  local METHOD = "textDocument/" .. scope
  vim.lsp.buf_request_all(bufnr, METHOD, function(client)
    local params = vim.lsp.util.make_position_params(win, client.offset_encoding)
    params = vim.tbl_extend("force", params, {
      context = {
        includeDeclaration = scope == "declaration" or scope == "definition",
      },
    })
    return params
  end, function(results, context, config)
    local all_items = {}
    for cilent_id, res in pairs(results) do
      local err, request_result = res.err, res.result
      local result = (request_result == nil or vim.tbl_isempty(request_result)) and {}
        or vim.islist(request_result) and request_result
        or { request_result }

      if err then
        vim.notify(err.message, vim.log.levels.WARN)
      else
        local client = assert(vim.lsp.get_client_by_id(cilent_id))
        local items = vim.lsp.util.locations_to_items(result or {}, client.offset_encoding)
        for i, _ in ipairs(items) do
          items[i].offset_encoding = client.offset_encoding
        end
        vim.list_extend(all_items, items)
      end
    end

    cb(all_items)
  end)
end

M.show = require("picker.utils").createShowFn(function(item)
  local utils = require("picker.utils")
  local hl_helper = require("picker.utils.highlights")

  local uri = item.user_data.uri or item.user_data.targetUri
  -- local range = item.range or item.targetSelectionRange
  local ft = vim.filetype.match({ filename = item.filename })
  local has_lang, lang = pcall(vim.treesitter.language.get_lang, ft)

  local path = string.format(" %s/", utils.truncate_path(vim.fn.fnamemodify(item.filename, ":~:.:h")))

  return {
    {
      utils.get_icon(uri),
    },
    { path, "Comment" },
    { vim.fn.fnamemodify(item.filename, ":t") .. ":" },
    { tostring(item.lnum), "Directory" },
    { " " },
    {
      item.text or "",
      has_lang and lang and ft and hl_helper.get_highlights({
        code = item.text,
        ft = ft,
        lang = lang,
      })[1] or nil,
    },
  }
end)

return M
