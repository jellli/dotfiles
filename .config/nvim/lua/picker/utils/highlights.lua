local M = {}
M.__buffers = {}

function M.get_hl_buffer(code, lang)
  local buf = M.__buffers[lang]

  if not (buf and vim.api.nvim_buf_is_valid(buf)) then
    buf = vim.api.nvim_create_buf(false, true)
    vim.api.nvim_buf_set_name(buf, ":pick/highlights/" .. lang)
    M.__buffers[lang] = buf
  end

  vim.bo[buf].buflisted = false
  vim.bo[buf].fixeol = false
  vim.bo[buf].eol = false

  vim.api.nvim_buf_set_lines(buf, 0, -1, false, vim.split(code, "\n", { plain = true }))
  return buf
end

---highlights
---@param opts {code: string,ft:string,lang:string}
function M.get_highlights(opts)
  local buf = M.get_hl_buffer(opts.code, opts.lang)
  local ok, parser = pcall(vim.treesitter.get_parser, buf, opts.lang)
  if not ok or not parser then
    return
  end

  local ret = {}

  parser:parse(true)
  parser:for_each_tree(function(tree, ltree)
    if not tree then
      return
    end

    local query = vim.treesitter.query.get(ltree:lang(), "highlights")
    -- Some injected languages may not have highlight queries.
    if not query then
      return
    end

    for capture, node, metadata in query:iter_captures(tree:root(), buf) do
      ---@type string
      local name = query.captures[capture]
      if name ~= "spell" then
        local range = { node:range() } ---@type number[]
        local multi = range[1] ~= range[3]
        local text = multi
            and vim.split(vim.treesitter.get_node_text(node, buf, metadata[capture]), "\n", { plain = true })
          or {}
        for row = range[1] + 1, range[3] + 1 do
          local first, last = row == range[1] + 1, row == range[3] + 1
          local end_col = last and range[4] or #(text[row - range[1]] or "")
          end_col = multi and first and end_col + range[2] or end_col
          ret[row] = ret[row] or {}
          table.insert(ret[row], {
            col = first and range[2] or 0,
            end_col = end_col,
            priority = (tonumber(metadata.priority or metadata[capture] and metadata[capture].priority) or 100),
            conceal = metadata.conceal or metadata[capture] and metadata[capture].conceal,
            hl_group = "@" .. name .. "." .. opts.lang,
          })
        end
      end
    end
  end)

  return ret
end

return M
