local M = {}
local H = {}
H.nsid = vim.api.nvim_create_namespace("_minipick_show")

function M.truncate_path(path)
  local sep = package.config:sub(1, 1)
  local parts = vim.split(path, sep)
  if #parts > 3 then
    parts = { parts[1], "…", parts[#parts - 1], parts[#parts] }
  end
  return table.concat(parts, sep)
end

---Get icon and highlight group
---@param filename string
---@return string icon
---@return string hl_group
function M.get_icon(filename)
  local ext = vim.fn.fnamemodify(filename, ":e")
  local icon, hl = require("nvim-web-devicons").get_icon(filename, ext, { default = true })
  return icon or " ", hl
end

---@param chunks table Array of { "text", "hl_group" }
---@return string full_text
---@return table highlights List of calculated byte offsets
function H.build_line(chunks)
  local full_text = ""
  local highlights = {}

  for _, chunk in ipairs(chunks) do
    local text = chunk[1] or ""
    local hl = chunk[2] -- Can be nil

    if hl then
      table.insert(highlights, {
        group = hl,
        start_col = #full_text,
        end_col = #full_text + #text,
      })
    end
    full_text = full_text .. text
  end

  return full_text, highlights
end

---@class Item
---@field text string
---@field lnum number
---@field uri string
---@field ft string
---@field lang? string

---createShowFn
---@param render? function
---@return function
function M.createShowFn(render)
  return function(bufnr, items, query)
    local ns = H.nsid
    local lines_to_show = {}
    local highlights = {}

    for i, item in ipairs(items) do
      local chunks

      if type(render) == "function" then
        chunks = render(item)
      else
        local hl_helper = require("picker.utils.highlights")
        local filename = item.filename
        chunks = {
          { M.get_icon(filename) },
          { " " },
          { M.truncate_path(vim.fn.fnamemodify(filename, ":~:.:h")) .. "/", "Comment" },
          { vim.fn.fnamemodify(filename, ":t") },
          { ":" .. (item.lnum or 0), "Directory" },
          { " " },
          {
            item.text or "",
            hl_helper.get_highlights({
              code = item.text,
              ft = item.ft,
              lang = item.lang,
            })[1],
          },
        }
      end

      local text, hls = H.build_line(chunks)

      lines_to_show[i] = text
      highlights[i] = hls
    end

    -- Update Buffer
    vim.api.nvim_buf_set_lines(bufnr, 0, -1, false, lines_to_show)
    vim.api.nvim_buf_clear_namespace(bufnr, ns, 0, -1)

    -- Apply Highlights
    for i, line_hls in ipairs(highlights) do
      local row = i - 1
      for _, hl in ipairs(line_hls) do
        if type(hl.group) == "string" then
          vim.hl.range(bufnr, ns, hl.group, { row, hl.start_col }, { row, hl.end_col }, {
            priority = 100,
          })
        end
        if type(hl.group) == "table" then
          for _, h in ipairs(hl.group) do
            vim.hl.range(bufnr, ns, h.hl_group, { row, hl.start_col + h.col }, { row, hl.end_col + h.end_col }, {
              priority = 100,
            })
          end
        end
      end

      local keyword = table.concat(query)
      if keyword and keyword ~= "" then
        local start_idx, end_idx = lines_to_show[i]:lower():find(keyword:lower(), 1, true)
        if start_idx then
          vim.hl.range(bufnr, ns, "IncSearch", { row, start_idx - 1 }, { row, end_idx }, {
            priority = 1000,
          })
        end
      end
    end
  end
end

return M
