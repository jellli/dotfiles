local icons = require("icons")
---@diagnostic disable: deprecated

---@class FFFItem
---@field name string
---@field path string
---@field relative_path string
---@field size number
---@field modified number
---@field total_frecency_score number
---@field modification_frecency_score number
---@field access_frecency_score number
---@field git_status string

local M = {}
local H = {}
H.set_buflines = function(buf_id, lines)
  pcall(vim.api.nvim_buf_set_lines, buf_id, 0, -1, false, lines)
end

-- FFF Picker
M.fff = {}
M.fff.ns_id = vim.api.nvim_create_namespace("fff-minipick")
M.fff.format_file_display = function(item)
  local filename = item.name
  local dir_path = item.directory or ""

  if dir_path == "" and item.relative_path then
    local parent_dir = vim.fn.fnamemodify(item.relative_path, ":h")
    if parent_dir ~= "." and parent_dir ~= "" then
      dir_path = parent_dir
    end
  end

  if dir_path == "" then
    return filename, ""
  end

  return filename, dir_path
end

--- @param buf_id number
--- @param items FFFItem[]
--- @param query table
function M.fff.picker_show(buf_id, items, query)
  local icon_data = {}
  local path_data = {}
  local padded_lines = {}
  for i, item in ipairs(items) do
    local icon, icon_hl_group =
      require("nvim-web-devicons").get_icon(item.name, vim.fn.fnamemodify(item.name, ":e"), { default = true })
    icon_data[i] = {
      icon,
      icon_hl_group,
    }

    local frecency = ""
    local total_frecency = (item.total_frecency_score or 0)

    if total_frecency > 0 then
      frecency = string.format(" %s %d", "", total_frecency)
    end

    local filename, dir_path = M.fff.format_file_display(item)

    path_data[i] = { filename, dir_path }
    local line = string.format("%s %s %s%s", icon, filename, dir_path, frecency)
    table.insert(padded_lines, line)
    -- padded_lines[i] = line
  end

  H.set_buflines(buf_id, padded_lines)

  for i, line in ipairs(padded_lines) do
    local icon, icon_hl_group = unpack(icon_data[i])
    local filename, dir_path = unpack(path_data[i])
    if icon_hl_group and vim.fn.strdisplaywidth(icon) > 0 then
      vim.api.nvim_buf_add_highlight(buf_id, M.fff.ns_id, icon_hl_group, i - 1, 0, vim.fn.strdisplaywidth(icon))
    end

    local star_start, star_end = line:find(" %d+")

    if star_start then
      vim.api.nvim_buf_add_highlight(buf_id, M.fff.ns_id, "Special", i - 1, star_start - 1, star_end)
    end

    local icon_match = line:match("^%S+")
    local len_of_icon_and_space = #icon_match + 1
    if icon_match and #filename > 0 and #dir_path > 0 then
      local prefix_len = len_of_icon_and_space + #filename + 1
      vim.api.nvim_buf_add_highlight(buf_id, M.fff.ns_id, "Comment", i - 1, prefix_len, prefix_len + #dir_path)
    end

    local match_start, match_end =
      -- do not highlight icon and score
      string.find(
        line:sub(len_of_icon_and_space, len_of_icon_and_space + #filename + 1 + #dir_path),
        table.concat(query) or "",
        1
      )
    if match_start and match_end then
      vim.api.nvim_buf_add_highlight(
        buf_id,
        M.fff.ns_id,
        "IncSearch",
        i - 1,
        len_of_icon_and_space + match_start - 2,
        len_of_icon_and_space + match_end - 1
      )
    end
  end
end

---@param query string[]|nil
---@return FFFItem[]
function M.fff.match(query)
  query = query or {}
  local file_picker = require("fff.file_picker")
  if not file_picker.is_initialized() then
    if not file_picker.setup() then
      vim.notify("Could not setup fff.nvim", vim.log.levels.ERROR)
      return {}
    end
  end
  return file_picker.search_files(table.concat(query), 100, 4, vim.fn.expand("%:."), false)
end

function M.fff.run()
  MiniPick.start({
    source = {
      name = "FFFiles",
      items = M.fff.match,
      match = function(_, _, query)
        MiniPick.set_picker_items(M.fff.match(query), { do_match = false })
      end,
      show = M.fff.picker_show,
    },
  })
end

-- Open LSP picker for the given scope
---@param scope "declaration" | "definition" | "document_symbol" | "implementation" | "references" | "type_definition" | "workspace_symbol"
function M.lsp_picker(scope)
  ---@return string
  local function get_symbol_query()
    return vim.fn.input("Symbol: ")
  end

  ---@param opts vim.lsp.LocationOpts.OnList
  local function on_list(opts)
    vim.fn.setqflist({}, " ", opts)

    if #opts.items == 1 then
      vim.cmd.cfirst()
    else
      require("mini.extra").pickers.list({ scope = "quickfix" }, { source = { name = opts.title } })
    end
  end

  if scope == "references" then
    vim.lsp.buf.references(nil, { on_list = on_list })
    return
  end

  if scope == "workspace_symbol" then
    vim.lsp.buf.workspace_symbol(get_symbol_query(), { on_list = on_list })
    return
  end

  vim.lsp.buf[scope]({ on_list = on_list })
end

M.b = {}
M.b.ns = vim.api.nvim_create_namespace("mini-bonus")
local function show(buf_id, items, query)
  local icon_data = {}
  local path_data = {}
  local padded_lines = {}
  for i, item in ipairs(items) do
    local icon, icon_hl_group =
      require("nvim-web-devicons").get_icon(item.name, vim.fn.fnamemodify(item.name, ":e"), { default = true })
    icon_data[i] = {
      icon,
      icon_hl_group,
    }
    local filename, dir_path = M.fff.format_file_display(item)
    path_data[i] = { filename, dir_path }
    local error_count = string.format("%s %d", icons.diagnostics.ERROR, item.diagnostics_counts[1])
    local warn_count = string.format("%s %d", icons.diagnostics.WARN, item.diagnostics_counts[2])
    local info_count = string.format("%s %d", icons.diagnostics.INFO, item.diagnostics_counts[3])
    local hint_count = string.format("%s %d", icons.diagnostics.HINT, item.diagnostics_counts[4])
    local diasgnostic_count = table.concat({ error_count, warn_count, info_count, hint_count }, " ")
    local line = string.format("%s %s %s %s", icon, filename, dir_path, diasgnostic_count)
    table.insert(padded_lines, line)
  end
  H.set_buflines(buf_id, padded_lines)

  for i, line in ipairs(padded_lines) do
    local icon, icon_hl_group = unpack(icon_data[i])
    local filename, dir_path = unpack(path_data[i])
    if icon_hl_group and vim.fn.strdisplaywidth(icon) > 0 then
      vim.api.nvim_buf_add_highlight(buf_id, M.b.ns, icon_hl_group, i - 1, 0, vim.fn.strdisplaywidth(icon))
    end

    local icon_match = line:match("^%S+")
    local len_of_icon_and_space = #icon_match + 1
    if icon_match and #filename > 0 and #dir_path > 0 then
      local prefix_len = len_of_icon_and_space + #filename + 1
      vim.api.nvim_buf_add_highlight(buf_id, M.b.ns, "Comment", i - 1, prefix_len, prefix_len + #dir_path)
    end

    local match_start, match_end =
      -- do not highlight icon and score
      string.find(
        line:sub(len_of_icon_and_space, len_of_icon_and_space + #filename + 1 + #dir_path),
        table.concat(query) or "",
        1
      )
    if match_start and match_end then
      vim.api.nvim_buf_add_highlight(
        buf_id,
        M.b.ns,
        "IncSearch",
        i - 1,
        len_of_icon_and_space + match_start - 2,
        len_of_icon_and_space + match_end - 1
      )
    end

    local error_start, error_end =
      string.find(line:sub(len_of_icon_and_space, -1), icons.diagnostics.ERROR .. " %d+", 1)
    if error_start and error_end then
      vim.api.nvim_buf_add_highlight(
        buf_id,
        M.b.ns,
        "DiagnosticError",
        i - 1,
        len_of_icon_and_space + error_start - 2,
        len_of_icon_and_space + error_end - 1
      )

      local warn_start, warn_end = string.find(line:sub(len_of_icon_and_space, -1), icons.diagnostics.WARN .. " %d+", 1)
      if warn_start and warn_end then
        vim.api.nvim_buf_add_highlight(
          buf_id,
          M.b.ns,
          "DiagnosticWarn",
          i - 1,
          len_of_icon_and_space + warn_start - 2,
          len_of_icon_and_space + warn_end - 1
        )
      end

      local info_start, info_end = string.find(line:sub(len_of_icon_and_space, -1), icons.diagnostics.INFO .. " %d+", 1)
      if info_start and info_end then
        vim.api.nvim_buf_add_highlight(
          buf_id,
          M.b.ns,
          "DiagnosticInfo",
          i - 1,
          len_of_icon_and_space + info_start - 2,
          len_of_icon_and_space + info_end - 1
        )
      end

      local hint_start, hint_end = string.find(line:sub(len_of_icon_and_space, -1), icons.diagnostics.HINT .. " %d+", 1)
      if hint_start and hint_end then
        vim.api.nvim_buf_add_highlight(
          buf_id,
          M.b.ns,
          "DiagnosticHint",
          i - 1,
          len_of_icon_and_space + hint_start - 2,
          len_of_icon_and_space + hint_end - 1
        )
      end
    end
  end
end

function M.buffers()
  local buffers_output = vim.api.nvim_exec("buffers", true)
  local items = {}
  for _, l in ipairs(vim.split(buffers_output, "\n")) do
    local buf_id, name = tonumber(l:match("^%s*%d+")), l:match('"(.*)"')
    local diagnostics = vim.diagnostic.get(buf_id)
    local diagnostics_counts = vim.iter(diagnostics):fold({ 0, 0, 0, 0 }, function(acc, v)
      acc[v.severity] = acc[v.severity] + 1
      return acc
    end)

    local item = {
      name = vim.fn.fnamemodify(name, ":p:t"),
      directory = vim.fn.fnamemodify(name, ":p:~:h"),
      bufnr = buf_id,
      diagnostics_counts = diagnostics_counts,
    }

    table.insert(items, item)
  end

  MiniPick.start({
    source = {
      name = "Buffers",
      items = items,
      show = show,
    },
  })
end

return M
