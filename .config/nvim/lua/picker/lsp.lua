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
  M.get_locations(scope, function(all_items)
    if not all_items or #all_items == 0 then
      vim.notify("No locations found", vim.log.levels.WARN)
      return
    end

    if #all_items == 1 then
      local win = vim.api.nvim_get_current_win()
      local from = vim.fn.getpos(".")
      local tagname = vim.fn.expand("<cword>")
      local item = all_items[1]
      local b = item.bufnr or vim.fn.bufadd(item.filename)

      -- Save position in jumplist
      vim.cmd("normal! m'")
      -- Push a new item into tagstack
      local tagstack = { { tagname = tagname, from = from } }
      vim.fn.settagstack(vim.fn.win_getid(win), { items = tagstack }, "t")

      vim.bo[b].buflisted = true
      local w = win
      if vim.api.nvim_win_get_buf(w) ~= b then
        w = vim.fn.bufwinid(b)
        w = w >= 0 and w or vim.fn.win_findbuf(b)[1] or win
        if w ~= win then
          vim.api.nvim_set_current_win(w)
        end
      end
      vim.api.nvim_win_set_buf(w, b)
      vim.api.nvim_win_set_cursor(w, { item.lnum, item.col - 1 })
      vim._with({ win = w }, function()
        -- Open folds under the cursor
        vim.cmd("normal! zv")
        vim.cmd("normal! zz")
      end)
      return
    end

    MiniPick.start({
      name = "ok",
      source = {
        name = scope,
        items = all_items,
        show = M.show,
        choose = function(item)
          item.path = item.filename
          MiniPick.default_choose(item)
        end,
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
  local range = item.user_data.range or item.user_data.targetSelectionRange
  local ft = vim.filetype.match({ filename = item.filename })
  local has_lang, lang = pcall(vim.treesitter.language.get_lang, ft)

  local path = string.format(" %s/", utils.truncate_path(vim.fn.fnamemodify(item.filename, ":~:.:h")))

  local code_hl = has_lang
      and lang
      and ft
      and hl_helper.get_highlights({
        code = item.text,
        ft = ft,
        lang = lang,
      })[1]
    or {}

  --         {
  --   col = 17,
  --   end_col = 33,
  --   hl_group = "Visual",
  --   priority = 100
  -- }
  table.insert(code_hl, {
    -- col = range["start"].character,
    -- end_col = range["end"].character,
    col = item.col,
    end_col = item.end_col,
    hl_group = "IncSearch",
    priority = 100,
  })

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
      code_hl,
    },
  }
end)

return M
